// ─────────────────────────────────────────────────────────────────
// typeRegistry.js — Phase 2C
//
// Purely observational. Built from whatever type: values exist
// in the indexed nodes. No hardcoded types. No prescriptions.
//
// Registry = mirror of reality, not a gatekeeper.
// Enforcement is Phase 2D's concern.
// ─────────────────────────────────────────────────────────────────

let typeMap = new Map(); // type → Set of sourceIds

function clearRegistry() {
    typeMap.clear();
}

// Called once per node during index build — if type: field exists
function registerType(typeValue, sourceId) {
    if (!typeValue || !sourceId) return;

    const normalized = typeValue.trim().toLowerCase();
    if (!normalized) return;

    if (!typeMap.has(normalized)) {
        typeMap.set(normalized, new Set());
    }
    typeMap.get(normalized).add(sourceId);
}

// Full registry — type → Set of sourceIds
function getRegistry() {
    return typeMap;
}

// All known type strings
function getTypes() {
    return new Set(typeMap.keys());
}

// Is this type present in at least one indexed node?
function isKnownType(typeValue) {
    if (!typeValue) return false;
    return typeMap.has(typeValue.trim().toLowerCase());
}

// Only one node has this type — likely a typo
function isSingleton(typeValue) {
    if (!typeValue) return false;
    const normalized = typeValue.trim().toLowerCase();
    const entry = typeMap.get(normalized);
    return entry ? entry.size === 1 : false;
}

function getRegistryStats() {
    let totalTyped = 0;
    for (const ids of typeMap.values()) totalTyped += ids.size;
    return {
        uniqueTypes: typeMap.size,
        totalTyped,
        singletons: [...typeMap.entries()]
            .filter(([, ids]) => ids.size === 1)
            .map(([type]) => type)
    };
}

module.exports = {
    clearRegistry,
    registerType,
    getRegistry,
    getTypes,
    isKnownType,
    isSingleton,
    getRegistryStats
};