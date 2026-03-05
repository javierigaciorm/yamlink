const vscode = require('vscode');
const { isKnownType } = require('../registries/typeRegistry');
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
    //
    // Scan the ENTIRE document once for [[links]].
    // Report as brokenRelation if inside frontmatter,
    // brokenLink if in body. Never double-report the
    // same position.
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
        const id            = match[1].trim();
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
    // Only fires in large vaults — small vaults
    // building out structure should never see this.
    // Singleton case removed entirely.
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

    diagnosticCollection.set(document.uri, diagnostics);
}

// ─────────────────────────────────────────────────────────────────
// getBrokenCount — counts broken link/relation diagnostics across
// all open documents. Used by the status bar in extension.js.
// ─────────────────────────────────────────────────────────────────
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
    getBrokenCount
};