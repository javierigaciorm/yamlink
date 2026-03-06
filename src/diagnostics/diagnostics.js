const vscode = require('vscode');
const { isKnownType } = require('../registries/typeRegistry');
const { hasSchema, getSchema, getDuplicateSchemas } = require('../registries/schemaRegistry');
const { getDuplicateIds } = require('../core/index');

const MIN_VAULT_SIZE_FOR_TYPE_ADVISORY = 10;

let diagnosticCollection;
let debounceTimer;

function registerDiagnostics(context, getIndex) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection("yamlink");
    context.subscriptions.push(diagnosticCollection);

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                validateDocument(event.document, getIndex);
            }, 500);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((doc) => {
            validateDocument(doc, getIndex);
        })
    );

    setTimeout(() => {
        vscode.workspace.textDocuments.forEach((doc) => {
            validateDocument(doc, getIndex);
        });
    }, 500);
}

function validateAll(getIndex) {
    vscode.workspace.textDocuments.forEach((doc) => {
        if (doc.languageId === 'markdown') {
            validateDocument(doc, getIndex);
        }
    });
}

// Wipes all diagnostics across all files.
// Called in rebuildAll() before validateAll() so stale diagnostics
// from deleted or renamed files never linger in the status bar count.
function clearAll() {
    if (diagnosticCollection) diagnosticCollection.clear();
}

function validateDocument(document, getIndex) {
    if (document.languageId !== 'markdown') return;
    if (!diagnosticCollection) return;

    const diagnostics = [];
    const text        = document.getText();
    const idIndex     = getIndex();

    // ─────────────────────────────────────────────
    // Diagnostic 1: Missing id field
    // ─────────────────────────────────────────────
    const hasFrontmatter = /^\s*---/.test(text);
    const hasId          = /^\s*id:\s*.+/m.test(text);

    if (!hasFrontmatter || !hasId) {
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
            `Yamlink: This file has no id field and will not be indexed as a node.`,
            vscode.DiagnosticSeverity.Hint
        );
        diagnostic.source = "yamlink";
        diagnostic.code   = "yamlink.missingId";
        diagnostics.push(diagnostic);
    }

    // ─────────────────────────────────────────────
    // Diagnostic 1b: Duplicate id
    // ─────────────────────────────────────────────
    if (hasFrontmatter && hasId) {
        const idMatch = text.match(/^\s*id:\s*([a-zA-Z0-9_-]+)\s*$/m);
        if (idMatch) {
            const thisId     = idMatch[1].trim();
            const duplicates = getDuplicateIds();
            if (duplicates.has(thisId)) {
                const idLineIndex = text
                    .split('\n')
                    .findIndex(line => /^\s*id:\s*.+/.test(line));
                const range = idLineIndex !== -1
                    ? document.lineAt(idLineIndex).range
                    : new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
                const conflictPaths = duplicates.get(thisId)
                    .map(p => p.split(/[\\/]/).pop())
                    .join(', ');
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Yamlink: id "${thisId}" is declared in multiple files: ${conflictPaths}`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.source = "yamlink";
                diagnostic.code   = "yamlink.duplicateId";
                diagnostics.push(diagnostic);
            }
        }
    }

    // ─────────────────────────────────────────────
    // Diagnostic 2: Broken [[links]]
    // ─────────────────────────────────────────────
    let frontmatterEnd = 0;
    if (hasFrontmatter) {
        const firstDash = text.indexOf('---');
        const closing   = text.indexOf('---', firstDash + 3);
        if (closing !== -1) frontmatterEnd = closing + 3;
    }

    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
        const id              = match[1].trim();
        const isInFrontmatter = frontmatterEnd > 0 && match.index < frontmatterEnd;

        if (!idIndex.has(id)) {
            const range = new vscode.Range(
                document.positionAt(match.index),
                document.positionAt(match.index + match[0].length)
            );
            const diagnostic = new vscode.Diagnostic(
                range,
                isInFrontmatter
                    ? `Yamlink: Relation "${id}" does not exist.`
                    : `Yamlink: ID "${id}" does not exist.`,
                vscode.DiagnosticSeverity.Warning
            );
            diagnostic.source = "yamlink";
            diagnostic.code   = isInFrontmatter
                ? "yamlink.brokenRelation"
                : "yamlink.brokenLink";
            diagnostics.push(diagnostic);
        }
    }

    // ─────────────────────────────────────────────
    // Diagnostic 3: Unknown type advisory
    // ─────────────────────────────────────────────
    if (hasFrontmatter && idIndex.size >= MIN_VAULT_SIZE_FOR_TYPE_ADVISORY) {
        const typeMatch = text.match(/^\s*type:\s*(.+?)\s*$/m);
        if (typeMatch) {
            const typeValue     = typeMatch[1].trim();
            const typeLineIndex = text
                .split('\n')
                .findIndex(line => /^\s*type:\s*.+/.test(line));

            if (typeLineIndex !== -1 && !isKnownType(typeValue)) {
                const range = document.lineAt(typeLineIndex).range;
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Yamlink: Type "${typeValue}" is not used by any other node yet.`,
                    vscode.DiagnosticSeverity.Information
                );
                diagnostic.source = "yamlink";
                diagnostic.code   = "yamlink.unknownType";
                diagnostics.push(diagnostic);
            }
        }
    }

    // ─────────────────────────────────────────────
    // Diagnostic 4: Missing required schema fields
    // ─────────────────────────────────────────────
    if (hasFrontmatter && hasId) {
        const typeMatch = text.match(/^\s*type:\s*(.+?)\s*$/m);
        if (typeMatch) {
            const typeValue = typeMatch[1].trim();
            if (hasSchema(typeValue)) {
                const schema = getSchema(typeValue);

                const firstDash    = text.indexOf('---');
                const closingIndex = text.indexOf('---', firstDash + 3);
                const fmText       = closingIndex !== -1
                    ? text.slice(firstDash + 3, closingIndex)
                    : '';

                const typeLineIndex = text
                    .split('\n')
                    .findIndex(l => /^\s*type:\s*.+/.test(l));

                for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
                    if (!fieldDef.required) continue;

                    const fieldPresent = new RegExp(
                        `^\\s*${fieldName}:\\s*.+`, 'm'
                    ).test(fmText);

                    if (!fieldPresent) {
                        const range = typeLineIndex !== -1
                            ? document.lineAt(typeLineIndex).range
                            : new vscode.Range(
                                new vscode.Position(0, 0),
                                new vscode.Position(0, 0)
                            );
                        const diagnostic = new vscode.Diagnostic(
                            range,
                            `Yamlink: Required field "${fieldName}" is missing` +
                            ` (schema: ${schema.sourceId})`,
                            vscode.DiagnosticSeverity.Warning
                        );
                        diagnostic.source = "yamlink";
                        diagnostic.code   = "yamlink.missingRequiredField";
                        diagnostics.push(diagnostic);
                    }
                }
            }
        }
    }

    // ─────────────────────────────────────────────
    // Diagnostic 5: Duplicate schema
    // ─────────────────────────────────────────────
    if (hasFrontmatter && hasId) {
        const isSchemaNode = /^\s*type:\s*schema\s*$/im.test(text);
        if (isSchemaNode) {
            const targetMatch = text.match(/^\s*target:\s*(.+?)\s*$/m);
            if (targetMatch) {
                const targetType = targetMatch[1].trim().toLowerCase();
                const dupSchemas = getDuplicateSchemas();
                if (dupSchemas.has(targetType)) {
                    const targetLineIndex = text
                        .split('\n')
                        .findIndex(l => /^\s*target:\s*.+/.test(l));
                    const range = targetLineIndex !== -1
                        ? document.lineAt(targetLineIndex).range
                        : new vscode.Range(
                            new vscode.Position(0, 0),
                            new vscode.Position(0, 0)
                        );
                    const canonical = dupSchemas.get(targetType)[0];
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Yamlink: A schema for "${targetType}" already exists` +
                        ` in "${canonical}" — this schema will be ignored.`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = "yamlink";
                    diagnostic.code   = "yamlink.duplicateSchema";
                    diagnostics.push(diagnostic);
                }
            }
        }
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

function getBrokenCount() {
    if (!diagnosticCollection) return 0;
    let count = 0;
    diagnosticCollection.forEach((_uri, diags) => {
        count += diags.filter(d =>
            d.code === 'yamlink.brokenLink' || d.code === 'yamlink.brokenRelation'
        ).length;
    });
    return count;
}

module.exports = {
    registerDiagnostics,
    validateAll,
    validateDocument,
    clearAll,
    getBrokenCount
};