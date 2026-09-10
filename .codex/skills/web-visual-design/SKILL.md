---
name: web-visual-design
description: Own the visual direction of a view - aesthetic commitment, type, color, motion, spatial composition, and background treatment - without breaking the locator, resource-key, and folder contracts the rest of the repository depends on. Use when the user asks for UI design work: a new screen's look, a redesign, a theme, a landing or marketing surface, or a review of how a view looks.
metadata:
  short-description: Visual direction, subordinate to the view contracts
---

# Web Visual Design

A view that looks generic is a real defect, and nothing else in this repository
owns that axis. This skill owns it.

It also has less authority than the skills around it, on purpose. Visual work is
where the other contracts get quietly traded away: a striking font that renders
Korean as boxes, a decorative header that drops the accessible name a browser
test locates by, a component that hard-codes `#0f172a` because a token felt like
overhead. Those are not aesthetic disagreements — they are broken builds and
broken tests wearing a nice typeface.

## When this applies

Apply this skill when the user asks for visual design work — a screen's look, a
redesign, a theme, a marketing or landing surface, or a review of how a view
looks.

Do **not** apply it to the scaffold baseline shell. That shell is deliberately
plain (`AGENTS.md` → Scope); redesigning it because a view was touched is scope
invention. Wait for the feature that asks for a look.

## Authority order

When this skill and another disagree, the other wins:

1. `i18n-resource-map` — every user-visible string is a key, in every required
   language. A design that only works with one language's text length is not
   done.
2. `headless-browser-test` — role, accessible name, landmark, and test-id
   contracts. Decoration goes *on top of* a locatable element, never in place of
   one.
3. `monorepo-architecture-guard` — folder decomposition by rate of change. Theme
   tokens are one folder; a feature's styling lives with the feature. A global
   stylesheet that keeps growing is two change rates merged.
4. This skill.

There is no aesthetic direction worth an untranslatable string, an unlocatable
control, or a god stylesheet. If the direction seems to require one, the
direction is wrong.

## Commit to a direction

Before writing markup, decide and write down:

* **Purpose** — what the interface is for, and who is on the other side of it.
* **Tone** — pick one and go all the way: brutally minimal, maximalist,
  editorial, brutalist, retro-futuristic, industrial, luxury, organic, art
  deco, toy-like. The list is a prompt, not a menu; the point is one clear
  position instead of an average of several.
* **Differentiator** — the one thing someone remembers afterward.

Intentionality, not intensity. Refined minimalism and loud maximalism both work;
an unlabelled middle does not. Match implementation weight to the direction —
maximalism earns elaborate code, restraint earns precision in spacing and
type, and neither earns the other's.

Do not converge. Across screens and across projects, vary theme, palette, and
type. A recognisable house default that appears every time is the failure this
skill exists to prevent.

## Type

* Avoid the defaults that read as unstyled: Inter, Roboto, Arial, raw
  `system-ui`. Pair a distinctive display face with a body face chosen for
  reading, not for matching.
* **Coverage is a hard gate.** Required languages include `ko`, `zh`, `hi`, and
  `ar`. A face without those glyphs may be used only for a Latin-only role
  (display headings whose text is Latin in every bundle), and only with a
  fallback stack that covers the rest. Every `font-family` ends with a generic
  family.
* `ar` is in the shipped set, so type and layout are direction-aware. Use
  logical properties (`margin-inline-start`, `padding-inline`, `text-align:
  start`) rather than left/right.
* Declare faces once, in the token file. A component never imports or declares a
  font.

## Color

* Commit to a palette: a dominant color with sharp accents beats an evenly
  distributed set that offends no one and says nothing.
* Every color is a token. No hex, `rgb()`, or `hsl()` literal appears in a
  component — including Tailwind arbitrary values like `bg-[#0f172a]`. Tokens
  live in the front-end token site (`styles.css` `@theme`, `tailwind.config.ts`,
  or a `front/theme/` folder); components consume names.
* Contrast is part of the palette, not a later fix. Body text and every
  interactive label meet WCAG AA against their actual background, including
  over gradients, images, and grain.

## Motion

* Spend the budget on one well-orchestrated moment — a staggered entrance, a
  meaningful state transition — rather than scattering micro-interactions.
* Prefer CSS. Reach for a motion library only when a sequence genuinely needs
  orchestration.
* Any real animation ships with a `prefers-reduced-motion: reduce` branch that
  removes it. This is checked.
* Motion never gates content: a headless browser reads the DOM immediately, so
  an element that only exists after an animation completes is a flaky test.

## Space and background

* Unexpected layout is allowed and encouraged — asymmetry, overlap, diagonal
  flow, grid-breaking elements, either generous negative space or controlled
  density.
* Atmosphere over flat fill: gradient meshes, noise and grain, geometric
  patterns, layered transparency, dramatic shadow, decorative rules.
* Decorative elements carry `aria-hidden="true"`; meaningful imagery carries an
  `alt` resolved from a resource key. Text baked into an image is untranslatable
  and unlocatable — it is a violation, not a style.
* A custom cursor or a removed outline must leave a visible focus state. If
  `outline-none` appears without `focus-visible`, the keyboard user lost the
  interface.

## Reject

* Generic AI aesthetics: Inter/Roboto/Arial defaults, purple gradient on white,
  the same card-grid-hero every time, a palette with no dominant color.
* A color or font literal in a component file.
* An animation with no reduced-motion branch.
* `outline-none` without a `focus-visible` state.
* Decoration that replaces a heading, a landmark, an accessible name, or a
  test-id anchor.
* A design that assumes English string lengths, or one direction of text flow.
* A global stylesheet that accumulates every feature's styling.

## Load

Run the mechanical check first; it decides the countable rules (color and font
literals, fallback stacks, reduced-motion, focus visibility, imagery
semantics):

```sh
bash .codex/skills/web-visual-design/scripts/check-design.sh
```

The script locates the repository root from its own position, so it is correct
from any working directory and wherever this skill was copied. Pass a path as
the first argument to check a different repository.

Report the emitted `check ... status=violation detail=...` lines and fix them
before writing prose about the design. `status=warn` lines list the declared
font families — read them against the required language set; glyph coverage is
the one gate no script can decide for you.

## Attribution

The aesthetic guidance here is adapted from Anthropic's public `frontend-design`
skill (Apache-2.0), reworked to sit under this repository's i18n, locator, and
decomposition contracts.
