const fs   = require('fs');
const path = require('path');
const { clearGraph, registerEdges, getGraphStats } = require('./graph');
const { clearRegistry, registerType, getRegistryStats } = require('./typeRegistry');

// ─────────────────────────────────────────────────────────────────
// Identity layer — id → filePath
// Graph layer + type registry fed during same scan pass.
// ─────────────────────────────────────────────────────────────────
let idIndex   = new Map(); // id → filePath
let pathIndex = new Map(); // filePath → id

function buildIndex(workspaceFolders) {
    idIndex.clear();
    pathIndex.clear();
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
        `[${[...require('./typeRegistry').getTypes()].join(', ') || 'none'}]`
    );

    if (registryStats.singletons.length > 0) {
        console.log(
            `Yamlink — Singleton types (possible typos): ${registryStats.singletons.join(', ')}`
        );
    }
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
        console.warn(`Yamlink — Duplicate id "${id}" in: ${fullPath}`);
        console.warn(`Yamlink — Already registered: ${idIndex.get(id)}`);
        return;
    }

    idIndex.set(id, fullPath);
    pathIndex.set(fullPath, id);

    // Feed graph edges
    const edges = extractEdgesFromFrontmatter(content);
    registerEdges(id, edges);

    // Feed type registry — observational, no enforcement
    const fields = parseFrontmatter(content);
    if (fields && fields.type) {
        registerType(fields.type, id);
    }
}

// ─────────────────────────────────────────────────────────────────
// extractId — strict allowlist
// ─────────────────────────────────────────────────────────────────
function extractId(content) {
    if (!content.startsWith('---')) return null;

    const closingIndex = content.indexOf('---', 3);
    if (closingIndex === -1) return null;

    const frontmatter = content.slice(3, closingIndex);
    const match = frontmatter.match(/^id:\s*([a-zA-Z0-9_-]+)\s*$/m);

    return match ? match[1].trim() : null;
}

function extractIdFromFrontmatter(filePath) {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch (e) { return null; }
    return extractId(content);
}

// ─────────────────────────────────────────────────────────────────
// extractEdgesFromFrontmatter
// ─────────────────────────────────────────────────────────────────
function extractEdgesFromFrontmatter(content) {
    const edges = [];
    if (!content.startsWith('---')) return edges;

    const closingIndex = content.indexOf('---', 3);
    if (closingIndex === -1) return edges;

    const frontmatter = content.slice(3, closingIndex);
    const linkRegex = /^([\w-]+):\s*\[\[([^\]]+)\]\]\s*$/mg;

    let match;
    while ((match = linkRegex.exec(frontmatter)) !== null) {
        const field    = match[1].trim();
        const targetId = match[2].trim();
        if (field === 'id') continue;
        edges.push({ field, targetId });
    }
    return edges;
}

// ─────────────────────────────────────────────────────────────────
// parseFrontmatter — all YAML fields as key→value
// Used by hover, type registry, Phase 2D schema
// ─────────────────────────────────────────────────────────────────
function parseFrontmatter(content) {
    if (!content.startsWith('---')) return null;

    const closingIndex = content.indexOf('---', 3);
    if (closingIndex === -1) return null;

    const frontmatter = content.slice(3, closingIndex);
    const result = {};

    for (const line of frontmatter.split('\n')) {
        const match = line.match(/^([\w-]+):\s*(.+?)\s*$/);
        if (match) result[match[1]] = match[2];
    }
    return result;
}

function getIndex()     { return idIndex; }
function getPathIndex() { return pathIndex; }

module.exports = {
    buildIndex,
    getIndex,
    getPathIndex,
    extractIdFromFrontmatter,
    extractEdgesFromFrontmatter,
    parseFrontmatter
};