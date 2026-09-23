# Selector Drift Checker — POC

## What this repo is

A small proof-of-concept for a TechShare demo. It has two parts:

1. **`demo-app/`** — a tiny, self-owned web app used as the target for the automation suite. It deliberately contains three kinds of UI so we can demo every detection tier: a normal HTML form (DOM-based selectors), a Shadow DOM component, and an HTML5 Canvas widget.
2. **`wdio-suite/`** — a WebdriverIO + TypeScript test suite, built on a Page Object Model, that automates `demo-app/` through a custom `locator()` helper. `locator()` tries a normal selector first and escalates through healing tiers only when that fails.

This is a demo/POC, not production tooling. Keep everything as small and readable as possible — every part of this needs to be shown on a slide or live on stage.

## Why we own the demo app instead of using an external site

We need to trigger selector drift **on cue**, live, during the talk. An external site can't be edited on demand mid-demo. So `demo-app/` supports a **drift toggle**: a query param (`?drift=promo-rename`) or a small config flag that swaps an attribute/class/label on load, simulating a frontend change without needing a real deploy. This is the only reason the app exists — keep it minimal otherwise.

## `demo-app/` — build list

Single small app (plain HTML/CSS/JS is fine — no framework needed unless it's genuinely easier with one). Three sections on one page, or three simple routes:

1. **Form page** — a login or checkout-style form (email field, a submit button, maybe a promo code field). This is the DOM-based target for tiers 0–2a.
   - Give elements clear, stable attributes by default (e.g. `data-testid="submit-order-btn"`).
   - Support a drift mode that renames/removes that attribute and relabels the button text, to simulate both structural drift (tier 1) and semantic drift (tier 2a).
2. **Shadow DOM component** — one element (e.g. a custom `<x-widget>` with a button inside an open shadow root) that a normal `$()` selector can't pierce without explicit shadow-root traversal. Used to justify escalating to tier 2b (vision) when DOM tooling genuinely can't help.
3. **Canvas widget** — a small `<canvas>` with one drawn "button" (a rectangle + label, no real DOM node). Also used for tier 2b (vision). Keep this to a handful of lines — a colored rect the user can click via coordinates is enough.

Drift toggle mechanism: pick ONE simple approach and use it consistently — e.g. a `?drift=<scenario>` query param read on page load that swaps the relevant attribute/label via a tiny inline script. No build step, no environment juggling.

## `wdio-suite/` — build list

Page Object Model structure:

```
wdio-suite/
  e2e/
    helpers/
      locator.ts          <- the resolution engine (see tiers below)
      locatorStore.ts      <- read/write locatorStore.json
    pageobjects/
      form.page.ts
      shadow.page.ts
      canvas.page.ts
    specs/
      form.spec.ts
      shadow.spec.ts
      canvas.spec.ts
  locatorStore.json        <- one shared store for the whole suite
  pendingSelectors.md      <- generated report of unresolved/needs-review selectors
  wdio.conf.ts
```

- **`specs/` never contain selectors.** They call page object methods only.
- **`pageobjects/` use `locator('page.element')` instead of raw `$()` calls.**
- **`helpers/locator.ts`** is where all tier logic lives.

### Detection tiers (in `locator.ts`)

Try each tier in order; stop at the first that resolves the element.

| Tier | What it does | Tool | On resolve |
|---|---|---|---|
| 0 — Stored selector | Try the selector already in `locatorStore.json` | WebdriverIO `$()` | Just touch `last_verified_at` |
| 1 — Fallback selector list | Try a short ordered list of alternate selectors defined per element (e.g. `data-testid` → `id` → text content) | Plain TypeScript, no API call | Auto-update `locatorStore.json` with the selector that worked, log to `history` |
| 2a — LLM text resolution | Send the element's stored `intent`, last-known snapshot, and the current accessibility tree to Claude | Claude API (text) | Never auto-commit — append to `pendingSelectors.md` |
| 2b — LLM vision resolution | Send a screenshot + `intent` to Claude, get back click coordinates or a bounding box | Claude API (vision) | Never auto-commit — append to `pendingSelectors.md` |

Tier 3 (full intent agent) is **out of scope for this POC** — not needed for the 5 demo steps below.

> Note: tier 1 is a **fallback selector list**, not a DOM-similarity scorer. This was a deliberate simplification for demo purposes — it's fast to build, and the audience can see exactly why it worked (the candidate list is visible in code). If we later want the "no one has to predict alternates in advance" version, that's a similarity-scorer upgrade for after the POC, not part of this build.

### `locatorStore.json` schema

```json
{
  "version": "1.0",
  "locators": {
    "form.submit_button": {
      "id": "form.submit_button",
      "selector": "[data-testid='submit-order-btn']",
      "fallbacks": ["#submit-btn", "button:has-text('Submit')"],
      "intent": "Primary submit button on the checkout form that finalizes the order",
      "last_verified_at": "2026-09-20T14:32:00Z",
      "history": []
    }
  }
}
```

### `pendingSelectors.md`

Flat, human-readable, appended to whenever tier 2a or 2b resolves something. One entry per unresolved locator: id, old selector, proposed selector/coordinates, confidence, reasoning, timestamp. No PR automation — a human reads this file and updates the page object by hand.

## The 5-step demo this needs to support

1. All selectors correct → all tests pass (tier 0 only).
2. One selector broken, no healing enabled → that test fails.
3. Same break, fallback list enabled → tier 1 resolves it, test passes.
4. A semantic rename (label changes, no good fallback matches) → tier 1 fails, tier 2a (Claude API text) resolves it, test passes, entry lands in `pendingSelectors.md`.
5. Shadow DOM or canvas target, no usable DOM → tier 2a fails or is skipped, tier 2b (Claude API vision) resolves it, test passes.

## Explicitly out of scope for this POC

- DOM-similarity scoring (using the fallback list instead — see tier 1 note above)
- Auto-PR / committing fixes back to source automatically
- Per-page-object store splitting (one shared `locatorStore.json` is enough)
- Concurrency / parallel-worker locking on the store
- Tier 3 (full intent agent)

## Tech stack

- TypeScript throughout
- WebdriverIO for the test suite
- Claude API for tiers 2a and 2b (no other LLM vendor — keep one consistent API surface)
- Demo app: plain HTML/CSS/JS, no framework unless it clearly simplifies the Shadow DOM or Canvas piece

## Working style for this repo

- Keep everything small and legible — this is a live-demo POC, not production code. Prefer a working, readable 30-line implementation over a robust 150-line one.
- Favor explicit, inspectable behavior over cleverness — during the talk, code may be shown on screen.
- Ask before adding new dependencies beyond what's listed above.
