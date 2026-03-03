# Yamlink

**Structured knowledge engine for VSCode. Graph-aware Markdown linking with stable YAML identity.**

Stop managing filenames. Yamlink makes your `id:` the permanent address of every note.

---

## The Problem

Markdown linking is filename-based and fragile. Rename a file and every link breaks. Types are inconsistent. Structure is optional and unenforced. Your vault is a folder of files, not a knowledge system.

## The Core Idea

Yamlink treats `id:` in YAML frontmatter as canonical identity. Not the filename.
```yaml
---
id: company-acme
type: account
---
```

Once a node has an `id:`, it becomes:
- **Linkable** — `[[company-acme]]` works from anywhere in the vault
- **Navigable** — Ctrl+Click jumps to it instantly
- **Renameable** — change the file name, nothing breaks
- **Propagating** — change the `id:`, every reference updates vault-wide

---

## What It Does Today

- **Stable identity** — `id:` is the canonical address, filename is cosmetic
- **[[Wikilink]] autocomplete** — live filtering of all indexed nodes
- **Ctrl+Click navigation** — jump to any node by ID
- **Hover preview** — YAML fields + body preview on hover
- **Vault-wide rename propagation** — change `id:` and all `[[refs]]` update with confirmation
- **Real-time diagnostics** — broken links flagged instantly as you type
- **Type registry** — observational, purely derived from your vault
- **Quick fixes** — create a node from a broken link, add frontmatter to plain files
- **Graph layer** — inbound and outbound edges tracked in memory

## What's Coming

- Schema enforcement — declare expected fields per type
- Query blocks — live tables from fenced `yamlink-query` blocks
- Backlinks sidebar panel
- Graph visualization
- Typed views and structured exports

---

## Philosophy

- **Local-first** — your files, your folder, no cloud
- **Git-native** — plain Markdown, fully version-controllable
- **Zero lock-in** — disable the extension, files stay valid Markdown
- **Schema-optional** — structure when you want it, never forced
- **No domain assumptions** — works for CRM, research, content ops, project management

---
## How It’s Different

Yamlink is not a note-taking app. Per se.
It is a structural layer inside VSCode.

No custom vault format.
No proprietary graph database.
No sync layer.
Just Markdown + identity + structure.
Applications are endless.

---

## Getting Started

1. Open any folder in VSCode
2. Create a Markdown file with a YAML frontmatter `id:` field
3. Start linking with `[[id]]`
```markdown
---
id: my-first-node
type: note
---

This links to [[another-node]].
```

That's it. Yamlink indexes it immediately.

---

## Layers

| Layer | What it means |
|---|---|
| 0 | Plain `.md` file — valid Markdown, not a Yamlink node |
| 1 | File with `id:` — indexed, linkable, navigable |
| 2 | Node with `type:` — typed entity |
| 3 | YAML field with `[[wikilink]]` — directed graph edge |
| 4 | Schema definition — validation and enforcement *(coming)* |

---

## Installation

Search for "Yamlink" in the VS Code Extensions Marketplace.
Or install via VSIX package.

---

## Version

`0.1.0` — Early Access. Core engine is stable. Schema enforcement and query layer in active development.

---

## License

MIT — Javier Ramirez