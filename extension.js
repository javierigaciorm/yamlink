const vscode = require('vscode');
const { buildIndex, getIndex, getPathIndex } = require('./src/core/index');
const { registerDefinition } = require('./src/features/definition');
const { registerCompletion } = require('./src/features/completion');
const { registerHover } = require('./src/features/hover');
const { registerDiagnostics, validateAll, getBrokenCount, clearAll } = require('./src/diagnostics/diagnostics');
const { registerCodeActions } = require('./src/actions/codeActions');
const { registerRename } = require('./src/core/rename');
const { registerBacklinks } = require('./src/features/backlinks');

function activate(context) {
    console.log("Yamlink activated");

    // ── Status bar ──────────────────────────────────────────────────
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
    registerDefinition(context, getIndex);
    registerCompletion(context, getIndex);
    registerHover(context, getIndex);
    registerDiagnostics(context, getIndex);
    registerCodeActions(context, getIndex, buildIndex);
    registerRename(context, getIndex, getPathIndex, buildIndex, validateAll);
    const backlinksProvider = registerBacklinks(context);

    validateAll(getIndex);
    updateStatusBar();

    // ── Full rebuild cycle ───────────────────────────────────────────
    // clearAll() wipes stale diagnostics from deleted/renamed files
    // before the fresh validateAll() pass. Without this, deleted files
    // leave their diagnostics behind and the status bar stays orange.
    function rebuildAll() {
        if (!vscode.workspace.workspaceFolders) return;
        buildIndex(vscode.workspace.workspaceFolders);
        clearAll();
        validateAll(getIndex);
        backlinksProvider.refresh();
        updateStatusBar();
    }

    context.subscriptions.push(
        vscode.workspace.onDidRenameFiles(() => rebuildAll())
    );

    context.subscriptions.push(
        vscode.workspace.onDidDeleteFiles(() => rebuildAll())
    );

    context.subscriptions.push(
        vscode.workspace.onDidCreateFiles(() => rebuildAll())
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(() => updateStatusBar())
    );
}

function deactivate() {}

module.exports = { activate, deactivate };