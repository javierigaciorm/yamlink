const fs   = require('fs');
const path = require('path');
const { clearGraph, registerEdges, getGraphStats } = require('./graph');
const { clearRegistry, registerType, getRegistryStats, getTypes } = require('../registries/typeRegistry');

let idIndex   = new Map();
let pathIndex = new Map();
let duplicateIds = new Map(); // id → [firstPath, ...conflictingPaths]

function buildIndex(workspaceFolders) {
    idIndex.clear();
    pathIndex.clear();
    duplicateIds.clear();
    clearGraph();
    clearRegistry();

    if (!workspaceFolders) return;

    const root = workspaceFolders[0].uri.fsPath;
    scanDirectory(root);

    const graphStats    = getGraphStats();
    const registryStats = getRegistryStats();

    console.log(
        `Yamlink — Index built: ${idIndex.size} node(s), ` +
        `${graphStats.totalEdges} edge(s), ` +
        `${registryStats.uniqueTypes} type(s) ` +
        `[${[...getTypes()].join(', ') || 'none'}]`
    );
}

function scanDirectory(dir) {
    let files;
    try {
        files = fs.readdirSync(dir);
    } catch (e) {
        console.error("Yamlink — Cannot read directory:", dir);
        return;
    }

    for (const file of files) {
        if (file.startsWith('.')) continue;

        const fullPath = path.join(dir, file);

        if (fullPath.includes(`${path.sep}_templates${path.sep}`) ||
            fullPath.endsWith(`${path.sep}_templates`)) continue;

        let stat;
        try { stat = fs.statSync(fullPath); } catch (e) { continue; }

        if (stat.isDirectory()) {
            scanDirectory(fullPath);
        } else if (file.endsWith('.md')) {
            indexFile(fullPath);
        }
    }
}

function indexFile(fullPath) {
    let content;
    try {
        content = fs.readFileSync(fullPath, 'utf8');
    } catch (e) {
        console.error("Yamlink — Cannot read:", fullPath);
        return;
    }

    const id = extractId(content);
    if (!id) return;

    if (idIndex.has(id)) {
        const firstPath = idIndex.get(id);
        if (!duplicateIds.has(id)) {
            duplicateIds.set(id, [firstPath]);
        }
        duplicateIds.get(id).push(fullPath);
        console.warn(`Yamlink — Duplicate id "${id}" in: ${fullPath}`);
        console.warn(`Yamlink — Already registered: ${firstPath}`);
        return;
    }

    idIndex.set(id, fullPath);
    pathIndex.set(fullPath, id);

    const edges = [
        ...extractEdgesFromFrontmatter(content),
        ...extractBodyLinks(content)
    ];
    registerEdges(id, edges);

    const fields = parseFrontmatter(content);
    if (fields && fields.type) {
        registerType(fields.type, id);
    }
}

// ─────────────────────────────────────────────────────────────────
// extractId — tolerates leading whitespace/BOM, strict allowlist
// ─────────────────────────────────────────────────────────────────
function extractId(content) {
    if (!/^\s*---/.test(content)) return null;

    const firstDash    = content.indexOf('---');
    const closingIndex = content.indexOf('---', firstDash + 3);
    if (closingIndex === -1) return null;

    const frontmatter = content.slice(firstDash + 3, closingIndex);
    const match = frontmatter.match(/^\s*id:\s*([a-zA-Z0-9_-]+)\s*$/m);

    return match ? match[1].trim() : null;
}

function extractIdFromFrontmatter(filePath) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch (e) { return null; }
    return extractId(content);
}

// ─────────────────────────────────────────────────────────────────
// extractEdgesFromFrontmatter
//
// Supports all YAML list formats:
//   A) indented list:    "  - [[id]]"
//   B) non-indented:     "- [[id]]"
//   C) inline single:    "field: [[id]]"
//   D) inline multi:     "field: [[id1]], [[id2]]"
//
// \s* before - makes indentation fully optional.
// ─────────────────────────────────────────────────────────────────
function extractEdgesFromFrontmatter(content) {
    const edges = [];
    if (!/^\s*---/.test(content)) return edges;

    const firstDash    = content.indexOf('---');
    const closingIndex = content.indexOf('---', firstDash + 3);
    if (closingIndex === -1) return edges;

    const frontmatter = content.slice(firstDash + 3, closingIndex);
    const lines       = frontmatter.split('\n');

    let currentField = null;

    for (const line of lines) {
        // Field declaration line: "field-name: value"
        const fieldMatch = line.match(/^([\w-]+):\s*(.*)$/);
        if (fieldMatch) {
            currentField      = fieldMatch[1].trim();
            const inlineValue = fieldMatch[2].trim();

            if (currentField === 'id') {
                currentField = null;
                continue;
            }

            // Inline links on same line as field (Format C + D)
            if (inlineValue) {
                const linkRegex = /\[\[([^\]]+)\]\]/g;
                let m;
                while ((m = linkRegex.exec(inlineValue)) !== null) {
                    edges.push({ field: currentField, targetId: m[1].trim() });
                }
            }
            continue;
        }

        // List item — \s* makes leading indentation optional (Format A + B)
        const listMatch = line.match(/^\s*-\s+\[\[([^\]]+)\]\]/);
        if (listMatch && currentField) {
            edges.push({ field: currentField, targetId: listMatch[1].trim() });
            continue;
        }

        // Non-indented, non-list line resets field context
        if (line.trim() && !line.match(/^\s/)) {
            currentField = null;
        }
    }

    return edges;
}

// ─────────────────────────────────────────────────────────────────
// extractBodyLinks
//
// Scans everything AFTER the frontmatter block for [[id]] patterns.
// All body links are registered with field = 'body' so they show
// up in the backlinks panel labeled as "body" — matching the README.
// ─────────────────────────────────────────────────────────────────
function extractBodyLinks(content) {
    const edges = [];

    // Find where body starts
    let bodyStart = 0;
    if (/^\s*---/.test(content)) {
        const firstDash    = content.indexOf('---');
        const closingIndex = content.indexOf('---', firstDash + 3);
        if (closingIndex !== -1) bodyStart = closingIndex + 3;
    }

    const body      = content.slice(bodyStart);
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match;

    while ((match = linkRegex.exec(body)) !== null) {
        const targetId = match[1].trim();
        if (targetId) edges.push({ field: 'body', targetId });
    }

    return edges;
}

// ─────────────────────────────────────────────────────────────────
// parseFrontmatter — flat key→value for hover + type registry
// ─────────────────────────────────────────────────────────────────
function parseFrontmatter(content) {
    if (!/^\s*---/.test(content)) return null;

    const firstDash    = content.indexOf('---');
    const closingIndex = content.indexOf('---', firstDash + 3);
    if (closingIndex === -1) return null;

    const frontmatter = content.slice(firstDash + 3, closingIndex);
    const result = {};

    for (const line of frontmatter.split('\n')) {
        const match = line.match(/^\s*([\w-]+):\s*(.+?)\s*$/);
        if (match) result[match[1]] = match[2];
    }
    return result;
}

function getIndex()        { return idIndex; }
function getPathIndex()    { return pathIndex; }
function getDuplicateIds() { return duplicateIds; }

module.exports = {
    buildIndex,
    getIndex,
    getPathIndex,
    getDuplicateIds,
    extractIdFromFrontmatter,
    extractEdgesFromFrontmatter,
    parseFrontmatter
};