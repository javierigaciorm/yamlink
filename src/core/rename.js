const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { validateAll } = require('../diagnostics/diagnostics');

const PREVIEW_THRESHOLD = 5;

let isPropagating = false;

function registerRename(context, getIndex, getPathIndex, buildIndex, validateAll) {
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (document.languageId !== 'markdown') {
                buildIndex(vscode.workspace.workspaceFolders);
                return;
            }

            if (isPropagating) {
                console.log("Yamlink — Save skipped during propagation");
                return;
            }

            const filePath  = document.uri.fsPath;
            const pathIndex = getPathIndex();

            const oldId = pathIndex.get(filePath) ?? null;
            const newId = extractIdFromDocument(document);

            buildIndex(vscode.workspace.workspaceFolders);
            validateAll(getIndex);

            if (!oldId && !newId) return;

            if (!oldId && newId) {
                console.log(`Yamlink — New node declared: "${newId}"`);
                return;
            }

            if (oldId && !newId) {
                console.log(`Yamlink — Node identity removed: "${oldId}"`);
                vscode.window.showWarningMessage(
                    `Yamlink: "${oldId}" removed its id field. All references are now broken.`
                );
                return;
            }

            if (oldId === newId) return;

            console.log(`Yamlink — Identity mutation: "${oldId}" → "${newId}"`);
            await handleIdentityMutation(oldId, newId, buildIndex, validateAll, getIndex);
        })
    );
}

async function handleIdentityMutation(oldId, newId, buildIndex, validateAll, getIndex) {
    if (!vscode.workspace.workspaceFolders) return;

    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
    let affected = [];

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Yamlink: Scanning vault for [[${oldId}]]...`,
            cancellable: false
        },
        async () => {
            affected = await findAffectedFilesAsync(root, oldId);
        }
    );

    if (affected.length === 0) {
        vscode.window.showInformationMessage(
            `Yamlink: ID renamed to "${newId}". No references found.`
        );
        return;
    }

    const edit = buildWorkspaceEdit(affected, oldId, newId);

    if (affected.length < PREVIEW_THRESHOLD) {
        const choice = await vscode.window.showWarningMessage(
            `Yamlink: "${oldId}" → "${newId}" — ${affected.length} file(s) reference this ID.`,
            { modal: true },
            'Apply',
            'Revert ID'
        );

        if (choice === 'Apply') {
            await applyWithGuard(edit);
            buildIndex(vscode.workspace.workspaceFolders);
            validateAll(getIndex);
            vscode.window.showInformationMessage(
                `Yamlink: Updated ${affected.length} file(s).`
            );
        } else if (choice === 'Revert ID') {
            await revertId(newId, oldId);
            buildIndex(vscode.workspace.workspaceFolders);
            validateAll(getIndex);
        }

    } else {
        const choice = await vscode.window.showWarningMessage(
            `Yamlink: "${oldId}" → "${newId}" — ${affected.length} file(s) affected.`,
            { modal: true },
            'Preview Changes',
            'Apply Directly',
            'Revert ID'
        );

        if (choice === 'Preview Changes') {
            await applyWithGuard(edit, { isRefactoring: true });
            buildIndex(vscode.workspace.workspaceFolders);
            validateAll(getIndex);
        } else if (choice === 'Apply Directly') {
            await applyWithGuard(edit);
            buildIndex(vscode.workspace.workspaceFolders);
            validateAll(getIndex);
            vscode.window.showInformationMessage(
                `Yamlink: Updated ${affected.length} file(s).`
            );
        } else if (choice === 'Revert ID') {
            await revertId(newId, oldId);
            buildIndex(vscode.workspace.workspaceFolders);
            validateAll(getIndex);
        }
    }
}

async function applyWithGuard(edit, options = {}) {
    isPropagating = true;
    try {
        await vscode.workspace.applyEdit(edit, options);
        // Flush edits to disk immediately. buildIndex reads from disk,
        // not from VS Code's in-memory buffers. Without this, a second
        // rename scans disk, finds the old content, and silently no-ops.
        // isPropagating is still true here so the save handler won't
        // re-trigger rename detection for these files.
        await vscode.workspace.saveAll(false);
    } finally {
        await new Promise(resolve => setTimeout(resolve, 300));
        isPropagating = false;
    }
}

async function findAffectedFilesAsync(dir, oldId) {
    const affected = [];
    const pattern  = `[[${oldId}]]`;
    await scanAsync(dir, pattern, affected);
    return affected;
}

async function scanAsync(dir, pattern, results) {
    let files;
    try {
        files = fs.readdirSync(dir);
    } catch (e) {
        return;
    }

    for (const file of files) {
        if (file.startsWith('.')) continue;

        const fullPath = path.join(dir, file);
        let stat;
        try { stat = fs.statSync(fullPath); } catch (e) { continue; }

        if (stat.isDirectory()) {
            await scanAsync(fullPath, pattern, results);
        } else if (file.endsWith('.md')) {
            let content;
            try { content = fs.readFileSync(fullPath, 'utf8'); } catch (e) { continue; }
            if (content.includes(pattern)) {
                results.push({ filePath: fullPath, content });
            }
        }

        await new Promise(resolve => setImmediate(resolve));
    }
}

function buildWorkspaceEdit(affected, oldId, newId) {
    const edit          = new vscode.WorkspaceEdit();
    const searchPattern = `[[${oldId}]]`;
    const replacement   = `[[${newId}]]`;

    for (const { filePath, content } of affected) {
        const uri   = vscode.Uri.file(filePath);
        const lines = content.split('\n');

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            if (!line.includes(searchPattern)) continue;

            let searchFrom = 0;
            while (true) {
                const charIndex = line.indexOf(searchPattern, searchFrom);
                if (charIndex === -1) break;

                edit.replace(
                    uri,
                    new vscode.Range(
                        new vscode.Position(lineIndex, charIndex),
                        new vscode.Position(lineIndex, charIndex + searchPattern.length)
                    ),
                    replacement
                );

                searchFrom = charIndex + searchPattern.length;
            }
        }
    }

    return edit;
}

async function revertId(currentId, targetId) {
    const openDocs = vscode.workspace.textDocuments;

    for (const doc of openDocs) {
        if (doc.languageId !== 'markdown') continue;

        const text        = doc.getText();
        const idLineIndex = text
            .split('\n')
            .findIndex(line => /^id:\s*.+/.test(line));

        if (idLineIndex === -1) continue;

        const currentIdInLine = doc.lineAt(idLineIndex).text
            .replace(/^id:\s*/, '').trim();

        if (currentIdInLine !== currentId) continue;

        const edit = new vscode.WorkspaceEdit();
        const line = doc.lineAt(idLineIndex);

        edit.replace(
            doc.uri,
            new vscode.Range(
                new vscode.Position(idLineIndex, 0),
                new vscode.Position(idLineIndex, line.text.length)
            ),
            `id: ${targetId}`
        );

        isPropagating = true;
        try {
            await vscode.workspace.applyEdit(edit);
            await doc.save();
        } finally {
            await new Promise(resolve => setTimeout(resolve, 300));
            isPropagating = false;
        }

        vscode.window.showInformationMessage(
            `Yamlink: ID reverted to "${targetId}"`
        );
        break;
    }
}

// ─────────────────────────────────────────────────────────────────
// extractIdFromDocument
//
// Reads id: from live document text — not from disk, not from index.
//
// Two fixes applied here:
//   1. Frontmatter detection uses regex /^\s*---/ instead of
//      startsWith('---') — tolerates BOM and leading whitespace.
//   2. ID regex uses strict allowlist [a-zA-Z0-9_-] — identical
//      to extractId() in index.js. Loose matching previously
//      allowed garbage values like "type:" as valid IDs.
//
// Invariant: this regex must always match index.js exactly.
// If one changes, both must change.
// ─────────────────────────────────────────────────────────────────
function extractIdFromDocument(document) {
    const text = document.getText();

    // Fix 1: tolerate leading whitespace / BOM
    if (!/^\s*---/.test(text)) return null;

    const closingIndex = text.indexOf('---', 3);
    if (closingIndex === -1) return null;

    const frontmatter = text.slice(3, closingIndex);

    // Fix 2: strict allowlist — identical to index.js
    const match = frontmatter.match(/^\s*id:\s*([a-zA-Z0-9_-]+)\s*$/m);
    return match ? match[1].trim() : null;
}

module.exports = { registerRename };