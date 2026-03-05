// ─────────────────────────────────────────────────────────────────
// backlinks.js — Phase 2.5 / Apollo
//
// Backlinks sidebar panel.
// Shows all inbound edges to the currently active Yamlink node.
//
// Data sources (both already in memory, no new indexing):
//   graph.js  → getBacklinks(id)  → [{ field, sourceId }]
//   index.js  → getIndex()        → id → filePath (for click-to-open)
//             → getPathIndex()    → filePath → id (to resolve active file)
//
// Update trigger: window.onDidChangeActiveTextEditor
// Registered in extension.js — this file owns nothing lifecycle-related.
//
// Empty states:
//   - Active file has no id → "Not a Yamlink node"
//   - Active file has id, no backlinks → "No inbound links"
//
// Tree shape (flat — no nesting needed at Apollo scope):
//   project-alpha        (owner)
//   meeting-2024-01-15   (related)
//   account-acme         (client)
//
// Clicking any item opens the source file.
// ─────────────────────────────────────────────────────────────────

const vscode = require('vscode');
const { getBacklinks } = require('../core/graph');
const { getIndex, getPathIndex } = require('../core/index');

class BacklinksProvider {
    constructor() {
        // EventEmitter drives VSCode's tree refresh mechanism
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData  = this._onDidChangeTreeData.event;
    }

    // Called by extension.js on every active editor change + after every buildIndex
    refresh() {
        this._onDidChangeTreeData.fire();
    }

    // ── TreeDataProvider contract ──────────────────────────────────

    getTreeItem(element) {
        return element;
    }

    getChildren(element) {
        // Tree is flat — only root-level items, no children
        if (element) return [];

        return this._buildItems();
    }

    // ── Internal ──────────────────────────────────────────────────

    _buildItems() {
        const editor = vscode.window.activeTextEditor;

        // No active editor or not a markdown file
        if (!editor || editor.document.languageId !== 'markdown') {
            return [this._placeholder('Open a Markdown file to see backlinks')];
        }

        const filePath  = editor.document.uri.fsPath;
        const pathIndex = getPathIndex();
        const id        = pathIndex.get(filePath) ?? null;

        // Active file is not an indexed Yamlink node
        if (!id) {
            return [this._placeholder('Not a Yamlink node — add an id: field to index this file')];
        }

        const backlinks = getBacklinks(id);

        if (backlinks.length === 0) {
            return [this._placeholder(`No inbound links to "${id}"`)];
        }

        const idIndex = getIndex();

        return backlinks.map(({ field, sourceId }) => {
            const item = new vscode.TreeItem(
                sourceId,
                vscode.TreeItemCollapsibleState.None
            );

            // Field name as secondary label — zero extra cost, high info density
            item.description = field;
            item.tooltip     = `${sourceId} → (${field}) → ${id}`;
            item.iconPath    = new vscode.ThemeIcon('arrow-left');

            // Click opens the source file
            const sourcePath = idIndex.get(sourceId);
            if (sourcePath) {
                item.command = {
                    command:   'vscode.open',
                    title:     'Open file',
                    arguments: [vscode.Uri.file(sourcePath)]
                };
            }

            return item;
        });
    }

    // Unclickable placeholder item for empty states
    _placeholder(message) {
        const item       = new vscode.TreeItem(message);
        item.iconPath    = new vscode.ThemeIcon('info');
        item.contextValue = 'yamlink.placeholder';
        return item;
    }
}

function registerBacklinks(context, onDidChangeActiveEditor) {
    const provider = new BacklinksProvider();

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('yamlink.backlinks', provider)
    );

    // Refresh whenever the active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => provider.refresh())
    );

    return provider; // returned so extension.js can call provider.refresh() after buildIndex
}

module.exports = { registerBacklinks };