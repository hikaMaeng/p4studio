---
name: i18n-resource-map
description: Enforce that every user-visible string comes from a translated resource key, never a literal in the view. Covers the flat dotted-key resource files per language, the required language set, and the per-folder static key map that keeps a component's resource surface small. Use when writing or reviewing any view, component, label, message, aria-label, or user-facing text.
---

# i18n Resource Map

No user-visible string is written in a view. Every one is a key, resolved at
render from a per-language resource file.

This is not a localization nicety. Two failures follow from literals in views,
and the second is the reason this skill exists:

1. A literal cannot be translated, so shipping a second language becomes a
   rewrite of every component instead of a new file.
2. A model asked to add a label with no key map in front of it will invent a
   key, or copy a plausible-looking one from elsewhere in the file — and a
   wrong key renders blank, silently. The per-folder map below is what makes an
   invented key impossible rather than merely discouraged.

## Resource files

* One flat JSON per language at `apps/<service>/assets/i18n/<lang>.json`.
* Flat, not nested. The key *is* the dotted path: `"app.shell.menu.open.button"`.
  Nesting hides the namespace and makes a key impossible to grep.
* Every language file carries the **identical key set**. A key present in one
  file and missing from another is a violation, not a to-do.
* Required languages — at minimum these eight:

  | Code | Language | Why it is in the required set |
  | --- | --- | --- |
  | `en` | English | fallback for every unresolved key |
  | `ko` | Korean | |
  | `zh` | Chinese | |
  | `es` | Spanish | |
  | `hi` | Hindi | |
  | `ar` | Arabic | forces right-to-left to be handled, not assumed |
  | `fr` | French | |
  | `pt` | Portuguese | |

  `ar` is load-bearing. Keeping a real RTL locale in the shipped set is what
  stops layout and iconography from silently hard-coding one direction. Do not
  drop it to "add later"; the layout debt compounds.
* Add more languages freely. Never ship fewer than the required set.

## Key naming

`<area>.<feature>.<element>.<kind>` — the last segment is the element's role:

| Suffix | Used for |
| --- | --- |
| `.text` | static display text, headings, titles |
| `.button` | button labels and their accessible names |
| `.label` | form labels, landmark and list accessible names |
| `.status` | live status text, `role="status"` content |
| `.message` | empty states and explanatory copy |
| `.alert` | error and warning text |

The suffix is what lets a reviewer see, from the key alone, whether a string is
being used in the right place — a `.button` rendered as a heading is a bug the
key exposes.

## The per-folder map

Each feature folder owns a `resource.ts` declaring only the keys its own
components use:

```ts
export enum RSC {
  APP_SHELL_TITLE_TEXT = "app.shell.title.text",
  APP_SHELL_HEALTH_BUTTON = "app.shell.health.button"
}
```

* The enum member name is the key uppercased with dots as underscores. That is
  mechanical and checked, so naming is never a decision.
* Components import `RSC` from their own folder, or from an ancestor folder for
  genuinely shared shell keys. They never import the resource JSON.
* Consumption is `t[RSC.SOME_KEY]`. Never `t["some.key"]` — a raw string
  reintroduces exactly the invented-key failure the map prevents.
* Keep the map to what the folder actually renders. Its value comes from being
  short enough to read in full; a map that accumulates every key in the project
  is the global file again, wearing a different name.

## Reject

* A string literal in JSX text, or in `aria-label`, `title`, `placeholder`,
  `alt`, or `label`.
* `t["literal.key"]` or any dynamic key built by concatenation. If a key must
  vary, declare each variant in the map and select between them.
* A key added to one language file only.
* A component importing `assets/i18n/*.json` directly.
* A `resource.ts` that re-exports the whole key space.

## Not covered

Server logs, error messages for developers, test ids, `className`, route paths,
and any string a user never sees. Those stay literals — translating them adds
indirection with no reader.

## Load

Run the mechanical check first; it decides the countable rules (language set,
key-set parity, enum-name derivation, unknown keys, and literal text in views):

```sh
bash .codex/skills/i18n-resource-map/scripts/check-i18n.sh
```

The script locates the repository root from its own position, so it is correct
from any working directory and wherever this skill was copied. Pass a path as
the first argument to check a different repository.

Report the emitted `check ... status=violation detail=...` lines and fix them
before writing prose about the UI.
