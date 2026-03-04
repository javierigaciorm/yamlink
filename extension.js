const vscode = require('vscode');
const { buildIndex, getIndex, getPathIndex } = require('./src/index');
const { registerDefinition } = require('./src/definition');
const { registerCompletion } = require('./src/completion');
const { registerHover } = require('./src/hover');
const { registerDiagnostics, validateAll } = require('./src/diagnostics');
const { registerCodeActions } = require('./src/codeActions');
const { registerRename } = require('./src/rename');
const { registerBacklinks } = require('./src/backlinks');

function activate(context) {
    console.log("Yamlink activated");

    // Build index first
    buildIndex(vscode.workspace.workspaceFolders);

    // Providers — registerDiagnostics MUST come before validateAll
    // It creates diagnosticCollection. Without it, validateAll silently no-ops.
    registerDefinition(context, getIndex);
    registerCompletion(context, getIndex);
    registerHover(context, getIndex);
    registerDiagnostics(context, getIndex);   // ← creates diagnosticCollection
    registerCodeActions(context, getIndex, buildIndex);
    registerRename(context, getIndex, getPathIndex, buildIndex, validateAll);

    // Backlinks panel — returns provider so file-system events can trigger refresh
    const backlinksProvider = registerBacklinks(context);

    // Helper: full rebuild cycle used by all file-system event handlers
    function rebuildAll() {
        if (!vscode.workspace.workspaceFolders) return;
        buildIndex(vscode.workspace.workspaceFolders);
        validateAll(getIndex);
        backlinksProvider.refresh();
    }

    // Now diagnosticCollection exists — validateAll will actually fire
    validateAll(getIndex);
    backlinksProvider.refresh();

    // File renamed — filename is cosmetic, rebuild only
    context.subscriptions.push(
        vscode.workspace.onDidRenameFiles(() => rebuildAll())
    );

    // File deleted — links to it surface as broken
    context.subscriptions.push(
        vscode.workspace.onDidDeleteFiles(() => rebuildAll())
    );

    // File created externally — new nodes become available
    context.subscriptions.push(
        vscode.workspace.onDidCreateFiles(() => rebuildAll())
    );
}

function deactivate() {}

module.exports = { activate, deactivate };