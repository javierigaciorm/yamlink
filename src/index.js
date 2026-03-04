const fs   = require('fs');
const path = require('path');
const { clearGraph, registerEdges, getGraphStats }       = require('./graph');
const { clearRegistry, registerType, getRegistryStats }  = require('./typeRegistry');
const { clearSchemaRegistry, registerSchemaNode, getSchemaStats } = require('./schemaRegistry');

// ─────────────────────────────────────────────────────────────────
// Identity layer — id → filePath
// Graph layer + type registry + schema registry fed during same scan pass.
// ─────────────────────────────────────────────────────────────────
let idIndex        = new Map(); // id → filePath (first writer wins)
let pathIndex      = new Map(); // filePath → id
let duplicateIndex = new Map(); // id → Set of filePaths (only populated when size > 1)

function buildIndex(workspaceFolders) {
    idIndex.clear();
    pathIndex.clear();
    duplicateIndex.clear();
    clearGraph();
    clearRegistry();
    clearSchemaRegistry();

    if (!workspaceFolders) return;

    const root = workspaceFolders[0].uri.fsPath;
    scanDirectory(root);

    const graphStats    = getGraphStats();
    const registryStats = getRegistryStats();
    const schemaStats   = getSchemaStats();

    console.log(
        `Yamlink — Index built: ${idIndex.size} node(s), ` +
        `${graphStats.totalEdges} edge(s), ` +
        `${registryStats.uniqueTypes} type(s) ` +
        `[${[...require('./typeRegistry').getTypes()].join(', ') || 'none'}], ` +
        `${schemaStats.schemas} schema(s) ` +
        `[${schemaStats.targets.join(', ') || 'none'}]`
    );

    if (registryStats.singletons.length > 0) {
        console.log(
            `Yamlink — Singleton types (possible typos): ${registryStats.singletons.join(', ')}`
        );
    }

    if (schemaStats.duplicates > 0) {
        console.warn(
            `Yamlink — Duplicate schemas detected for ${schemaStats.duplicates} type(s) — ` +
            `first writer wins; diagnostics will surface the extras`
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
        const firstPath = idIndex.get(id);
        console.warn(`Yamlink — Duplicate id "${id}" in: ${fullPath}`);
        console.warn(`Yamlink — Already registered: ${firstPath}`);

        // Track both files so diagnostics can surface the conflict on each
        if (!duplicateIndex.has(id)) {
            duplicateIndex.set(id, new Set([firstPath]));
        }
        duplicateIndex.get(id).add(fullPath);
        return;
    }

    idIndex.set(id, fullPath);
    pathIndex.set(fullPath, id);

    // Feed graph edges — YAML relations + body wikilinks (hybrid graph)
    // YAML edges carry semantic field labels. Body links get field: 'body'.
    // If a body link duplicates a YAML edge to the same target, YAML wins —
    // dedup keeps the richer label and avoids double entries in the panel.
    const yamlEdges = extractEdgesFromFrontmatter(content);
    const bodyEdges = extractBodyLinks(content, yamlEdges);
    registerEdges(id, [...yamlEdges, ...bodyEdges]);

    // Shared frontmatter parse — used by type registry + schema registry
    const fields = parseFrontmatter(content);

    // Feed type registry — observational, no enforcement
    if (fields && fields.type) {
        registerType(fields.type, id);
    }

    // Feed schema registry — only for schema nodes
    // Passes raw frontmatter text so js-yaml can handle nested fields: block.
    // parseFrontmatter() is flat and cannot handle it.
    if (fields && fields.type && fields.type.trim().toLowerCase() === 'schema') {
        const frontmatterText = extractFrontmatterText(content);
        if (frontmatterText) {
            registerSchemaNode(id, frontmatterText);
        }
    }
}

// ─────────────────────────────────────────────────────────────────
// extractId — strict allowlist
// ─────────────────────────────────────────────────────────────────
function extractId(content) {
    if (!/^\s*---/.test(content)) return null;

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
// extractFrontmatterText
//
// Returns the raw string between the two --- delimiters.
// Used to feed js-yaml in schemaRegistry — parseFrontmatter()
// is intentionally flat and cannot handle nested blocks.
// ─────────────────────────────────────────────────────────────────
function extractFrontmatterText(content) {
    if (!/^\s*---/.test(content)) return null;

    const closingIndex = content.indexOf('---', 3);
    if (closingIndex === -1) return null;

    return content.slice(3, closingIndex);
}

// ─────────────────────────────────────────────────────────────────
// extractEdgesFromFrontmatter
// ─────────────────────────────────────────────────────────────────
function extractEdgesFromFrontmatter(content) {
    const edges = [];
    if (!/^\s*---/.test(content)) return edges;

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
// extractBodyLinks
//
// Finds all [[id]] references in the document body (after frontmatter).
// Returns { field: 'body', targetId } for each unique target not already
// covered by a YAML edge from this same source.
//
// Dedup rule: YAML edges take precedence. If a body link points to the
// same target as an existing YAML edge, it is silently dropped — the
// panel will show the richer YAML label, not a duplicate 'body' entry.
//
// Self-links (node linking to its own id) are skipped — they are never
// meaningful as graph edges.
// ─────────────────────────────────────────────────────────────────
function extractBodyLinks(content, yamlEdges = []) {
    const bodyLinks = [];

    // Find body start — everything after closing ---
    let bodyStart = 0;
    if (/^\s*---/.test(content)) {
        const closingIndex = content.indexOf('---', 3);
        if (closingIndex !== -1) {
            bodyStart = closingIndex + 3;
        }
    }

    const body = content.slice(bodyStart);
    if (!body.trim()) return bodyLinks;

    // Build a set of targetIds already covered by YAML edges
    const yamlTargets = new Set(yamlEdges.map(e => e.targetId));

    // Also get the source node's own id to skip self-links
    const sourceId = extractId(content);

    const linkRegex = /\[\[([^\]]+)\]\]/g;
    const seen      = new Set();
    let match;

    while ((match = linkRegex.exec(body)) !== null) {
        const targetId = match[1].trim();

        if (!targetId)             continue; // empty brackets
        if (targetId === sourceId) continue; // self-link
        // YAML edges take precedence over body mentions to the same target.
        // This is intentional — YAML carries semantic field labels; a body
        // mention is incidental prose. Showing both would duplicate the same
        // source node in the backlinks panel with no additional structural
        // meaning. The backlinks panel represents relationships, not mentions.
        // If this feels wrong to a future reader: do not remove it.
        if (yamlTargets.has(targetId)) continue; // YAML already covers this
        if (seen.has(targetId))    continue; // dedup within body itself

        seen.add(targetId);
        bodyLinks.push({ field: 'body', targetId });
    }

    return bodyLinks;
}


// Used by hover, type registry, diagnostics.
// Cannot handle nested blocks — that is intentional.
// Nested parsing is done by schemaRegistry via js-yaml directly.
// ─────────────────────────────────────────────────────────────────
function parseFrontmatter(content) {
    if (!/^\s*---/.test(content)) return null;

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

function getIndex()          { return idIndex; }
function getPathIndex()      { return pathIndex; }
function getDuplicateIndex() { return duplicateIndex; }

module.exports = {
    buildIndex,
    getIndex,
    getPathIndex,
    getDuplicateIndex,
    extractIdFromFrontmatter,
    extractFrontmatterText,
    extractEdgesFromFrontmatter,
    parseFrontmatter
};