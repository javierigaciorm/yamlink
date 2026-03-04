const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { validateAll } = require('./diagnostics');

// ─────────────────────────────────────────────────────────────────
// ID validation — must match extractId() in index.js exactly.
// Invariant: if one changes, both must change.
// ─────────────────────────────────────────────────────────────────
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

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

    // ─────────────────────────────────────────────────────────────
    // Command: yamlink.createNode
    //
    // Canonical user-facing entry point for creating a Yamlink node.
    // Invoked via Command Palette. No arguments — prompts for ID.
    //
    // Invariants:
    //   - ID validated against strict allowlist before anything touches disk
    //   - Collision check against live idIndex before file creation
    //   - Filename derived from ID: <id>.md at workspace root
    //   - Template is minimal Layer 1 — id + created only, no type:
    //   - Same buildIndex + validateAll sequence as all other creation paths
    // ─────────────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('yamlink.createNode', async () => {
            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showErrorMessage("Yamlink: No workspace folder open.");
                return;
            }

            // ── Step 1: Prompt for ID ──
            const id = await vscode.window.showInputBox({
                prompt: 'Enter a Yamlink node ID',
                placeHolder: 'e.g. project-alpha, contact-jane, meeting-2024-01-15',
                validateInput(value) {
                    if (!value || value.trim() === '') {
                        return 'ID cannot be empty';
                    }
                    if (!VALID_ID_REGEX.test(value.trim())) {
                        return 'ID may only contain letters, numbers, hyphens, and underscores';
                    }
                    return null; // valid
                }
            });

            if (!id) return; // user cancelled
            const trimmedId = id.trim();

            // ── Step 2: Collision check against live index ──
            const idIndex = getIndex();
            if (idIndex.has(trimmedId)) {
                const existingPath = idIndex.get(trimmedId);
                const choice = await vscode.window.showWarningMessage(
                    `Yamlink: ID "${trimmedId}" already exists.`,
                    { modal: true },
                    'Open Existing'
                );
                if (choice === 'Open Existing') {
                    const doc = await vscode.workspace.openTextDocument(existingPath);
                    await vscode.window.showTextDocument(doc);
                }
                return;
            }

            // ── Step 3: Derive filename from ID ──
            const root     = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const filePath = path.join(root, `${trimmedId}.md`);

            // Guard against filesystem collision (file exists but not indexed)
            if (fs.existsSync(filePath)) {
                vscode.window.showWarningMessage(
                    `Yamlink: "${trimmedId}.md" already exists on disk but is not indexed. ` +
                    `Open it and add an id: field to promote it to a node.`
                );
                return;
            }

            // ── Step 4: Write minimal Layer 1 template ──
            const today   = new Date().toISOString().split('T')[0];
            const content =
`---
id: ${trimmedId}
created: ${today}
---

`;

            fs.writeFileSync(filePath, content, 'utf8');

            // ── Step 5: Rebuild + validate + open ──
            buildIndex(vscode.workspace.workspaceFolders);
            validateAll(getIndex);

            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);

            vscode.window.showInformationMessage(`Yamlink: Node "${trimmedId}" created`);
        })
    );

    // ─────────────────────────────────────────────────────────────
    // Command: yamlink.createNote
    //
    // Invoked by broken-link quick fix. ID is pre-supplied.
    // Not user-facing in Command Palette — internal to quick fix flow.
    // ─────────────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('yamlink.createNote', async (id) => {
            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showErrorMessage("Yamlink: No workspace folder open.");
                return;
            }

            // Guard: broken link text may not be a valid ID (e.g. [[My Note]])
            // Index would ignore it, but we must not write a file that violates
            // the ID invariant. Surface clearly rather than silently creating bad state.
            if (!VALID_ID_REGEX.test(id)) {
                vscode.window.showErrorMessage(
                    `Yamlink: "${id}" is not a valid node ID. ` +
                    `IDs may only contain letters, numbers, hyphens, and underscores.`
                );
                return;
            }

            const root     = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const filePath = path.join(root, `${id}.md`);

            if (fs.existsSync(filePath)) {
                vscode.window.showWarningMessage(`Yamlink: "${id}.md" already exists.`);
                return;
            }

            const today   = new Date().toISOString().split('T')[0];
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

    // ─────────────────────────────────────────────────────────────
    // Command: Promote a plain markdown file to a Yamlink node
    // Inserts minimal frontmatter at top of file
    // ─────────────────────────────────────────────────────────────
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