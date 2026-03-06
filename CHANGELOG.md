# Changelog

## [Unreleased]
<!-- 0.2.0 in progress: schema enforcement + field suggestions -->

### Fixed
- Diagnostics improvements and stability fixes
- Minor extension debugging and internal cleanup

## 0.1.0 — "Apollo"

### Added
- Canonical `id:` identity model — filename is cosmetic, `id:` is permanent
- Vault-wide rename propagation with preview and revert
- Hybrid graph (YAML typed relations + body wikilinks)
- Backlinks panel in Explorer sidebar with edge labels
- Hover previews with frontmatter fields + body preview
- Ctrl+Click definition navigation
- Duplicate ID detection surfaced as Warning diagnostics
- Observational type registry (derived entirely from vault)
- Strict ID validation (`[a-zA-Z0-9_-]` allowlist enforced at all creation paths)

### Foundation
- Schema registry scaffold (Phase 2D groundwork — observational, not yet enforced)