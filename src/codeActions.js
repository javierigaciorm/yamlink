const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { validateAll } = require('./diagnostics');

function registerCodeActions(context, getIndex, buildIndex) {
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            'markdown',
            {
                provideCodeActions(document, range, codeActionContext) {
                    const actions = [];

                    for (const diagnostic of codeActionContext.diagnostics) {
                        if (diagnostic.source !== 'yamlink') continue;

                        const code = diagnostic.code?.value ?? diagnostic.code;

                        // ─────────────────────────────────────────
                        // Action: Add id field (missing frontmatter)
                        // Layer 0 → Layer 1 promotion
                        // ─────────────────────────────────────────
                        if (code === 'yamlink.missingId') {
                            const fileName = path.basename(
                                document.uri.fsPath, '.md'
                            );

                            const action = new vscode.CodeAction(
                                `Yamlink: Add id field to this file`,
                                vscode.CodeActionKind.QuickFix
                            );

                            action.command = {
                                command: 'yamlink.addFrontmatter',
                                title: 'Add Frontmatter',
                                arguments: [document, fileName]
                            };

                            action.diagnostics = [diagnostic];
                            action.isPreferred = true;
                            actions.push(action);
                        }

                        // ─────────────────────────────────────────
                        // Action: Create note (broken body link)
                        // ─────────────────────────────────────────
                        if (code === 'yamlink.brokenLink' || code === 'yamlink.brokenRelation') {
                            const rawText = document.getText(diagnostic.range);
                            const match = rawText.match(/\[\[([^\]]+)\]\]/);
                            if (!match) continue;

                            const id = match[1].trim();

                            const action = new vscode.CodeAction(
                                `Yamlink: Create note "${id}"`,
                                vscode.CodeActionKind.QuickFix
                            );

                            action.command = {
                                command: 'yamlink.createNote',
                                title: 'Create Note',
                                arguments: [id]
                            };

                            action.diagnostics = [diagnostic];
                            action.isPreferred = true;
                            actions.push(action);
                        }
                    }

                    return actions;
                }
            },
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
        )
    );

    // ─────────────────────────────────────────────────────
    // Command: Create a new Yamlink node from a broken link
    // ─────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('yamlink.createNote', async (id) => {
            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showErrorMessage("Yamlink: No workspace folder open.");
                return;
            }

            const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const filePath = path.join(root, `${id}.md`);

            if (fs.existsSync(filePath)) {
                vscode.window.showWarningMessage(`Yamlink: "${id}.md" already exists.`);
                return;
            }

            const today = new Date().toISOString().split('T')[0];

            // Minimal Layer 1 template — just identity, nothing forced
            const content =
`---
id: ${id}
created: ${today}
---

`;

            fs.writeFileSync(filePath, content, 'utf8');

            buildIndex(vscode.workspace.workspaceFolders);
            validateAll(getIndex);

            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);

            vscode.window.showInformationMessage(`Yamlink: Created node "${id}"`);
        })
    );

    // ─────────────────────────────────────────────────────
    // Command: Promote a plain markdown file to a Yamlink node
    // Inserts minimal frontmatter at top of file
    // ─────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'yamlink.addFrontmatter',
            async (document, suggestedId) => {
                const today = new Date().toISOString().split('T')[0];
                const text = document.getText();
                const hasFrontmatter = text.startsWith('---');

                const edit = new vscode.WorkspaceEdit();

                if (hasFrontmatter) {
                    // Frontmatter exists but no id: — insert id as first field
                    const insertPos = new vscode.Position(1, 0);
                    edit.insert(
                        document.uri,
                        insertPos,
                        `id: ${suggestedId}\n`
                    );
                } else {
                    // No frontmatter at all — prepend full block
                    edit.insert(
                        document.uri,
                        new vscode.Position(0, 0),
                        `---\nid: ${suggestedId}\ncreated: ${today}\n---\n\n`
                    );
                }

                await vscode.workspace.applyEdit(edit);
                await document.save();

                buildIndex(vscode.workspace.workspaceFolders);
                validateAll(getIndex);

                vscode.window.showInformationMessage(
                    `Yamlink: "${suggestedId}" is now a Yamlink node`
                );
            }
        )
    );
}

module.exports = { registerCodeActions };