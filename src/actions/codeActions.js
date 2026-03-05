const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { validateAll } = require('../diagnostics/diagnostics');
const { getTypes } = require('../registries/typeRegistry');

function registerCodeActions(context, getIndex, buildIndex) {
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            'markdown',
            {
                provideCodeActions(document, range, codeActionContext) {
                    const actions = [];
                    const seenIds = new Set();

                    for (const diagnostic of codeActionContext.diagnostics) {
                        if (diagnostic.source !== 'yamlink') continue;

                        const code = diagnostic.code?.value ?? diagnostic.code;

                        // ── Add id field to plain markdown file ──
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

                        // ── Create node from broken link ──
                        if (code === 'yamlink.brokenLink' ||
                            code === 'yamlink.brokenRelation') {

                            const rangeText = document.getText(diagnostic.range);
                            const match = rangeText.match(/\[\[([^\]]+)\]\]/);

                            if (!match || !match[1] || match[1].trim() === '') continue;

                            const id = match[1].trim();
                            if (seenIds.has(id)) continue;
                            seenIds.add(id);

                            const action = new vscode.CodeAction(
                                `Yamlink: Create node "${id}"`,
                                vscode.CodeActionKind.QuickFix
                            );
                            action.command = {
                                command: 'yamlink.createNote',
                                title: 'Create Node',
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

    // ── Create new Yamlink node ──────────────────────────────────────
    //
    // Two entry points:
    //   A) Quick Fix on a broken [[link]] — id is passed as argument,
    //      skip all prompts and create immediately.
    //   B) Command Palette — no id argument, ask for id then type.
    //
    context.subscriptions.push(
        vscode.commands.registerCommand('yamlink.createNote', async (id) => {
            let chosenType = null;

            if (!id || typeof id !== 'string' || id.trim() === '') {
                // ── Palette flow: ask for ID ──
                id = await vscode.window.showInputBox({
                    title: 'Create Yamlink Node',
                    prompt: 'Node ID',
                    placeHolder: 'my-node-id',
                    validateInput: (v) => {
                        if (!v || !v.trim()) return 'ID cannot be empty';
                        if (!/^[a-zA-Z0-9_-]+$/.test(v.trim())) {
                            return 'Use only letters, numbers, hyphens, underscores';
                        }
                        return null;
                    }
                });
                if (!id) return;
                id = id.trim();

                // ── Palette flow: ask for type ──
                const knownTypes = [...getTypes()];
                const typeItems  = [
                    ...knownTypes.map(t => ({
                        label:       t,
                        description: 'existing type'
                    })),
                    {
                        label:       '$(plus) Enter new type…',
                        description: ''
                    }
                ];

                if (knownTypes.length > 0) {
                    const pick = await vscode.window.showQuickPick(typeItems, {
                        title:       'Node Type',
                        placeHolder: 'Select a type — press Escape to skip'
                    });
                    if (pick) {
                        if (pick.label.startsWith('$(plus)')) {
                            chosenType = await vscode.window.showInputBox({
                                title:        'New Type',
                                prompt:       'Enter a type name',
                                placeHolder:  'contact',
                                validateInput: (v) => {
                                    if (v && !/^[a-zA-Z0-9_-]+$/.test(v.trim())) {
                                        return 'Use only letters, numbers, hyphens, underscores';
                                    }
                                    return null;
                                }
                            });
                            if (chosenType) chosenType = chosenType.trim() || null;
                        } else {
                            chosenType = pick.label;
                        }
                    }
                } else {
                    // Vault has no types yet — free text entry
                    const raw = await vscode.window.showInputBox({
                        title:       'Node Type',
                        prompt:      'Type (optional — press Escape to skip)',
                        placeHolder: 'contact'
                    });
                    if (raw && raw.trim()) chosenType = raw.trim();
                }
            }

            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showErrorMessage("Yamlink: No workspace folder open.");
                return;
            }

            const root     = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const filePath = path.join(root, `${id}.md`);

            if (fs.existsSync(filePath)) {
                vscode.window.showWarningMessage(
                    `Yamlink: "${id}.md" already exists.`
                );
                return;
            }

            const today     = new Date().toISOString().split('T')[0];
            const typeField = chosenType ? `type: ${chosenType}\n` : '';
            const content   =
`---
id: ${id}
${typeField}created: ${today}
---

`;

            fs.writeFileSync(filePath, content, 'utf8');

            buildIndex(vscode.workspace.workspaceFolders);
            validateAll(getIndex);

            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);

            vscode.window.showInformationMessage(
                `Yamlink: Created node "${id}"${chosenType ? ` (${chosenType})` : ''}`
            );
        })
    );

    // ── Promote plain markdown to Yamlink node ──
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'yamlink.addFrontmatter',
            async (document, suggestedId) => {
                const today          = new Date().toISOString().split('T')[0];
                const text           = document.getText();
                const hasFrontmatter = /^\s*---/.test(text);
                const edit           = new vscode.WorkspaceEdit();

                if (hasFrontmatter) {
                    edit.insert(
                        document.uri,
                        new vscode.Position(1, 0),
                        `id: ${suggestedId}\n`
                    );
                } else {
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