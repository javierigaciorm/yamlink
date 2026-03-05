const vscode = require('vscode');
const { buildIndex, getIndex, getPathIndex } = require('./src/core/index');
const { registerDefinition } = require('./src/features/definition');
const { registerCompletion } = require('./src/features/completion');
const { registerHover } = require('./src/features/hover');
const { registerDiagnostics, validateAll, getBrokenCount } = require('./src/diagnostics/diagnostics');
const { registerCodeActions } = require('./src/actions/codeActions');
const { registerRename } = require('./src/core/rename');
const { registerBacklinks } = require('./src/features/backlinks');

function activate(context) {
    console.log("Yamlink activated");

    // ── Status bar ──────────────────────────────────────────────────
    // Sits in the bottom bar, left side. Shows live node count and
    // turns orange with a count if any broken links exist.
    const statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left, 100
    );
    statusBar.name = 'Yamlink';
    context.subscriptions.push(statusBar);

    function updateStatusBar() {
        const nodeCount = getIndex().size;
        const broken    = getBrokenCount();
        if (broken > 0) {
            statusBar.text            = `$(graph) Yamlink  $(warning) ${nodeCount} nodes · ${broken} broken`;
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            statusBar.text            = `$(graph) Yamlink  ${nodeCount} nodes`;
            statusBar.backgroundColor = undefined;
        }
        statusBar.show();
    }

    // Build index first
    buildIndex(vscode.workspace.workspaceFolders);

    // Providers — registerDiagnostics MUST come before validateAll.
    // It creates diagnosticCollection. Without it, validateAll silently no-ops.
    registerDefinition(context, getIndex);
    registerCompletion(context, getIndex);
    registerHover(context, getIndex);
    registerDiagnostics(context, getIndex);
    registerCodeActions(context, getIndex, buildIndex);
    registerRename(context, getIndex, getPathIndex, buildIndex, validateAll);
    const backlinksProvider = registerBacklinks(context);

    // Now diagnosticCollection exists — validateAll and status bar will fire
    validateAll(getIndex);
    updateStatusBar();

    // Helper: full rebuild cycle for all file-system events
    function rebuildAll() {
        if (!vscode.workspace.workspaceFolders) return;
        buildIndex(vscode.workspace.workspaceFolders);
        validateAll(getIndex);
        backlinksProvider.refresh();
        updateStatusBar();
    }

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

    // Update status bar after every save so broken count stays live
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(() => updateStatusBar())
    );
}

function deactivate() {}

module.exports = { activate, deactivate };