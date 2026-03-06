# Yamlink

Structured knowledge engine systems for VS Code.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/yamlink.yamlink?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=yamlink.yamlink) ![Version](https://img.shields.io/badge/version-0.1.0--Apollo-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blueviolet)

Yamlink turns Markdown vaults into **structured knowledge systems** built on a simple idea: identity belongs in your frontmatter, not your filenames.

![Yamlink Demo](media/demo.gif)

---

Yamlink turns Markdown vaults into **structured knowledge systems**.

Instead of relying on filenames as identity, each Markdown file declares a canonical `id:` in YAML frontmatter. That identity becomes the permanent node of your vault — linkable, navigable, and rename-safe.

Use Yamlink to build:

- Personal knowledge bases
- Research databases and literature maps
- CRM-style relationship graphs
- Project and architecture knowledge systems
- Documentation knowledge graphs
- World-building and narrative systems

All local-first. All Git-native.

---

## Install

Install Yamlink directly from the VS Code Marketplace:

https://marketplace.visualstudio.com/items?itemName=yamlink.yamlink

Or search **"Yamlink"** in the VS Code Extensions panel.

---

## The Problem

Most Markdown linking systems rely on filenames. Over time, files are renamed, reorganized, and moved. Links drift and references break. A vault slowly becomes a loose collection of documents rather than a coherent system.

Yamlink separates **identity** from **filenames**.

---

## The Core Idea

Every node declares its identity in YAML frontmatter:
=======
Each Markdown file declares a canonical `id:` in YAML frontmatter. That identity becomes the permanent node of your vault — linkable, navigable, and rename-safe.

```yaml
---
id: concept-recursion
type: concept
created: 2025-01-15
---
A function that calls itself. The base case prevents infinite descent.
```

Use Yamlink to build:

- Personal knowledge bases
- Research databases and literature maps
- CRM-style relationship graphs
- Project and architecture knowledge systems
- World-building and narrative systems

All local-first. All Git-native.

---

## The Problem

Most Markdown linking systems rely on filenames. Rename a file and every reference breaks. Over time, a vault drifts into a loose collection of documents with no coherent structure.

Yamlink separates **identity** from **filenames**.

---

## Features

|Feature|Description|
|---|---|
|Canonical `id:` identity|Filename is cosmetic. The `id:` field is permanent.|
|Vault-wide rename propagation|Change an ID, update every reference — with confirmation.|
|Hybrid graph model|YAML typed relations + body wikilinks, both tracked.|
|Backlinks panel|Every inbound link to the active node, labeled by field.|
|Wikilink autocomplete|`[[` triggers suggestions from every indexed node.|
|Ctrl+Click navigation|Jump to any node instantly.|
|Hover preview|Frontmatter fields + body snippet on hover.|
|Real-time diagnostics|Broken links, duplicate IDs, unknown types — as you type.|
|Quick fixes|Create a node from a broken link. Add frontmatter to any file.|
|Observational type registry|Types are derived from your vault — nothing hardcoded.|
|Status bar|Live node count and broken link indicator.|

---

## Getting Started

**1. Open a folder in VS Code.**

**2. Create your first node.**

Run `Yamlink: Create Node` from the Command Palette (`Ctrl+Shift+P`). Enter an ID and select a type — the file is created and opened immediately.

```yaml
---
id: elara-voss
type: character
created: 2025-01-15
---
```

**3. Start linking.**

Type `[[` anywhere to trigger autocomplete.

```markdown
The market district was [[elara-voss]]'s territory long before the guild took notice.
```

**4. Build structure.**

Declare typed relations in frontmatter to make connections explicit.

```yaml
---
id: chapter-04
type: chapter
protagonist: [[elara-voss]]
location: [[the-shattered-fen]]
created: 2025-01-15
---
```

Open `elara-voss.md` — the Backlinks panel shows `chapter-04` labeled `protagonist`.

---

## Rename Propagation

When you change an `id:` and save, Yamlink scans your entire vault, shows you how many files are affected, and asks for confirmation before applying anything. Large changes can be previewed. Every change can be reverted.

**References are never silently broken.**

---

## Backlinks Panel

The Backlinks panel in the Explorer sidebar shows every inbound link to the active file, labeled by how it was declared.

```
chapter-04        protagonist
research-notes    body
weekly-review     body
```

YAML field relations show their field name. Body wikilinks are labeled `body`. Click any entry to open that file.

---

## Diagnostics

|Code|Severity|Meaning|
|---|---|---|
|`yamlink.missingId`|Hint|File has no `id:` and is not indexed|
|`yamlink.duplicateId`|Warning|Same `id:` declared in multiple files|
|`yamlink.brokenLink`|Warning|Body wikilink references a non-existent node|
|`yamlink.brokenRelation`|Warning|YAML relation references a non-existent node|
|`yamlink.unknownType`|Info|`type:` value not seen in any other node|

All diagnostics are non-destructive. Every warning has a Quick Fix.

---

## ID Rules

IDs use letters, numbers, hyphens, and underscores only.

```
elara-voss          ✓
concept_recursion   ✓
Elara Voss          ✗  spaces not allowed
note#1              ✗  special characters not allowed
```

The same rule applies to field names. Use `related-concepts` not `related concepts` — fields with spaces are not recognized as graph edges.

---

## Philosophy

- **Local-first** — your vault is a folder of plain Markdown files
- **Git-native** — every node, relation, and change is version-controlled
- **Schema-optional** — structure emerges from your vault; nothing is enforced until you want it
- **No proprietary storage** — disable the extension and your files remain valid Markdown
- **No cloud dependency** — nothing leaves your machine

The extension adds structure, not lock-in.

---

## Roadmap

**Phase 2 — Intelligence Layer** _(in progress)_

- Schema enforcement — declare required fields per type
- Field suggestions based on type — YAML autocomplete guided by schema

**Phase 3 — Query Surface**

- Vault health report — nodes by type, broken links, orphans, total word count
- Graph visualization — D3.js webview of the full node graph
- Orphan detection — nodes with no connections surfaced automatically

**Phase 4 — Views + Export**

- Type-filtered sidebar views
- Kanban view for nodes with `status:` field
- Export pipeline — PDF, HTML, structured JSON

**Phase 5 — Platform**

- Web companion for read-only vault viewing
- API layer for programmatic vault queries
- Team vaults — shared graph, merge-safe via Git

---

**0.1.0 — Apollo** · Identity engine · Hybrid graph · Backlinks panel · Real-time diagnostics