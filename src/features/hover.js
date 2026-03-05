const vscode = require('vscode');
const fs     = require('fs');
const { parseFrontmatter } = require('../core/index');

// ─────────────────────────────────────────────────────────────────
// hover.js — Hover preview (Stage 2B)
//
// Hover over [[id]] → tooltip shows:
//   - YAML fields from frontmatter
//   - First N lines of body content
//
// Independent of graph layer. Works on identity index alone.
// ─────────────────────────────────────────────────────────────────

const PREVIEW_LINES = 8; // Number of body lines to show in tooltip

function registerHover(context, getIndex) {
    context.subscriptions.push(
        vscode.languages.registerHoverProvider('markdown', {
            provideHover(document, position) {
                const idIndex = getIndex();
                const line    = document.lineAt(position.line).text;
                const regex   = /\[\[([^\]]+)\]\]/g;

                let match;
                while ((match = regex.exec(line)) !== null) {
                    const start = match.index;
                    const end   = start + match[0].length;

                    // Only trigger when cursor is inside [[...]]
                    if (position.character < start || position.character > end) continue;

                    const id       = match[1].trim();
                    const filePath = idIndex.get(id);

                    if (!filePath) {
                        // Node doesn't exist — hint that it can be created
                        const md = new vscode.MarkdownString(
                            `⚠ **Yamlink**: \`${id}\` is not indexed.\n\n` +
                            `_Use Quick Fix (Ctrl+.) to create this node._`
                        );
                        md.isTrusted = true;
                        return new vscode.Hover(md);
                    }

                    // Node exists — build rich preview
                    const content = readFile(filePath);
                    if (!content) return;

                    const hover = buildHoverContent(id, content, filePath);
                    return new vscode.Hover(hover);
                }
            }
        })
    );
}

// ─────────────────────────────────────────────────────────────────
// buildHoverContent
// Assembles MarkdownString from frontmatter + body preview
// ─────────────────────────────────────────────────────────────────
function buildHoverContent(id, content, filePath) {
    const md = new vscode.MarkdownString();
    md.isTrusted        = true;
    md.supportHtml      = false;
    md.supportThemeIcons = true;

    // ── Header ──
    md.appendMarkdown(`### $(file) \`${id}\`\n\n`);

    // ── YAML fields ──
    const frontmatter = parseFrontmatter(content);
    if (frontmatter && Object.keys(frontmatter).length > 0) {
        md.appendMarkdown(`---\n`);
        for (const [key, value] of Object.entries(frontmatter)) {
            if (key === 'id') continue; // Already shown in header
            md.appendMarkdown(`**${key}:** ${value}  \n`);
        }
        md.appendMarkdown(`\n`);
    }

    // ── Body preview ──
    const bodyPreview = extractBodyPreview(content);
    if (bodyPreview) {
        md.appendMarkdown(`---\n`);
        md.appendMarkdown(bodyPreview);
    }

    return md;
}

// ─────────────────────────────────────────────────────────────────
// extractBodyPreview
// Returns first N non-empty lines after the frontmatter block
// ─────────────────────────────────────────────────────────────────
function extractBodyPreview(content) {
    // Find end of frontmatter — use regex to tolerate BOM / leading whitespace
    let bodyStart = 0;
    if (/^\s*---/.test(content)) {
        const firstDash    = content.indexOf('---');
        const closingIndex = content.indexOf('---', firstDash + 3);
        if (closingIndex !== -1) {
            bodyStart = closingIndex + 3;
        }
    }

    const body = content.slice(bodyStart);
    const lines = body
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .slice(0, PREVIEW_LINES);

    if (lines.length === 0) return null;

    return lines.join('\n\n') + (lines.length === PREVIEW_LINES ? '\n\n_..._' : '');
}

function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        console.error("Yamlink — Hover: cannot read file:", filePath);
        return null;
    }
}

module.exports = { registerHover };