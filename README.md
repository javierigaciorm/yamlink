# Yamlink

Structured knowledge engine for VS Code.

Yamlink makes the `id:` field in YAML frontmatter the canonical identity of every Markdown note.

Rename files freely. Change identity deliberately.


![Yamlink Demo](media/demo.gif)

---

## The Problem

Most Markdown linking systems rely on filenames. Over time, renaming files breaks references and structure drifts. A vault becomes a loose collection of documents rather than a coherent system.

Yamlink separates identity from filenames.

---

## Core Idea

Identity lives in YAML frontmatter.

```yaml
---
id: company-acme
type: account
created: 2024-01-15
---
```

Once a file declares an `id:`:

- It becomes linkable via `[[company-acme]]`
- Ctrl+Click navigates directly to it
- The filename can change without breaking references
- Changing the `id:` triggers controlled rename propagation

---

## Rename Propagation

Yamlink treats identity mutation as a structural event.

When you change an `id:` and save:

- The vault is scanned for references to the old ID
- You are prompted before changes are applied
- Large updates can be previewed
- You can revert the ID change if needed

References are never silently broken.

---

## Current Capabilities (0.1.0 – Apollo)

- Canonical `id:` identity model
- Vault-wide rename propagation
- Wikilink autocomplete
- Ctrl+Click navigation
- Hover preview (frontmatter + body snippet)
- Hybrid graph model:
  - YAML relations (field-labeled edges)
  - Body wikilinks
- Backlinks panel in the Explorer
- Duplicate ID detection
- Real-time diagnostics
- Observational type registry
- Strict ID validation (letters, numbers, hyphens, underscores)

---

## Backlinks

The Backlinks panel shows inbound links to the active file.

YAML field relations preserve their field name:

```text
project-alpha    owner
meeting-2024     related
```

Body wikilinks are labeled as `body`.

---

## Getting Started

1. Open a folder in VS Code.
2. Run `Yamlink: Create Node` from the Command Palette.
3. Enter an ID (letters, numbers, hyphens, underscores only).

Example:

```yaml
---
id: my-first-node
created: 2024-01-15
---
```

Start linking using:

```markdown
[[my-first-node]]
```

---

## ID Rules

Valid:

- project-alpha
- contact_jane
- meeting-2024-01-15

Invalid:

- My Project
- note#1

The filename is cosmetic. The `id:` is canonical.

---

## Diagnostics

Yamlink surfaces structural issues as you work.

- `yamlink.missingId` — file has no `id:` and is not indexed
- `yamlink.duplicateId` — same `id:` declared in multiple files
- `yamlink.brokenLink` — body link references a non-existent node
- `yamlink.brokenRelation` — YAML relation references a non-existent node
- `yamlink.unknownType` — new or unseen `type:` value
- `yamlink.singletonType` — `type:` appears on only one node

All diagnostics are non-destructive and fixable.

---

## Philosophy

- Local-first
- Git-native
- Schema-optional
- No proprietary storage
- Files remain valid Markdown if the extension is disabled

---

## Roadmap

In development:

- Schema enforcement
- Field suggestions based on type
- Query blocks
- Dedicated sidebar container
- Graph visualization

---

## Version

0.1.0 — Apollo

Identity engine, hybrid graph, and backlinks panel.

---

## License

MIT — Javier Ramirez