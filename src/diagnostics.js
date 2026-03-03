const vscode = require('vscode');
const { isSingleton, isKnownType } = require('./typeRegistry');

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
    const text = document.getText();

    // ─────────────────────────────────────────────
    // Diagnostic 1: Missing id field (Layer 0 → 1)
    // Hint — subtle, non-alarming, just informational
    // ─────────────────────────────────────────────
    const hasFrontmatter = /^\s*---/.test(text);
    const hasId          = /^id:\s*.+/m.test(text);

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
    // Diagnostic 2: Broken wikilinks in body
    // Warning — a real broken reference
    // ─────────────────────────────────────────────
    const idIndex   = getIndex();
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
        const id = match[1].trim();
        if (!idIndex.has(id)) {
            const range = new vscode.Range(
                document.positionAt(match.index),
                document.positionAt(match.index + match[0].length)
            );
            const diagnostic = new vscode.Diagnostic(
                range,
                `Yamlink: ID "${id}" does not exist.`,
                vscode.DiagnosticSeverity.Warning
            );
            diagnostic.source = "yamlink";
            diagnostic.code   = "yamlink.brokenLink";
            diagnostics.push(diagnostic);
        }
    }

    // ─────────────────────────────────────────────
    // Diagnostic 3: Broken wikilinks in YAML fields
    // Warning — a real broken relation
    // ─────────────────────────────────────────────
    if (hasFrontmatter) {
        const closingIndex = text.indexOf('---', 3);
        if (closingIndex !== -1) {
            const frontmatter   = text.slice(3, closingIndex);
            const yamlLinkRegex = /\[\[([^\]]+)\]\]/g;
            let yamlMatch;

            while ((yamlMatch = yamlLinkRegex.exec(frontmatter)) !== null) {
                const id = yamlMatch[1].trim();
                if (!idIndex.has(id)) {
                    const absoluteOffset = yamlMatch.index + 4;
                    const range = new vscode.Range(
                        document.positionAt(absoluteOffset),
                        document.positionAt(absoluteOffset + yamlMatch[0].length)
                    );
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Yamlink: Relation "${id}" does not exist.`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.source = "yamlink";
                    diagnostic.code   = "yamlink.brokenRelation";
                    diagnostics.push(diagnostic);
                }
            }
        }
    }

    // ─────────────────────────────────────────────
    // Diagnostic 4: Unknown / singleton type (Phase 2C)
    //
    // Information severity — not Hint (invisible), not Warning
    // (implies broken). Information is the correct semantic:
    // advisory, visible, non-coercive.
    //
    // Two cases:
    //   A) Type not in registry → new/unknown type
    //   B) Type in registry but only one node uses it → possible typo
    //
    // \s* tolerates any leading indentation on type: field.
    // ─────────────────────────────────────────────
    if (hasFrontmatter) {
        const typeMatch = text.match(/^\s*type:\s*(.+?)\s*$/m);
        if (typeMatch) {
            const typeValue     = typeMatch[1].trim();
            const typeLineIndex = text
                .split('\n')
                .findIndex(line => /^\s*type:\s*.+/.test(line));

            if (typeLineIndex !== -1) {
                const range = document.lineAt(typeLineIndex).range;

                if (!isKnownType(typeValue)) {
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Yamlink: Type "${typeValue}" is not used by any other node yet.`,
                        vscode.DiagnosticSeverity.Information
                    );
                    diagnostic.source = "yamlink";
                    diagnostic.code   = "yamlink.unknownType";
                    diagnostics.push(diagnostic);
                    console.log(`Yamlink — Unknown type diagnostic pushed: "${typeValue}"`);

                } else if (isSingleton(typeValue)) {
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Yamlink: Type "${typeValue}" only appears on this node — possible typo?`,
                        vscode.DiagnosticSeverity.Information
                    );
                    diagnostic.source = "yamlink";
                    diagnostic.code   = "yamlink.singletonType";
                    diagnostics.push(diagnostic);
                    console.log(`Yamlink — Singleton type diagnostic pushed: "${typeValue}"`);
                }
            }
        }
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

module.exports = {
    registerDiagnostics,
    validateAll,
    validateDocument
};