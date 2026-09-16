# Photos Header Title — Identity + Month Anchor — Design

**Date:** 2026-07-31
**Scope:** Replace the home date pill's visible-range span ("Mar 21 – Jun 2") with a two-state title: gallery identity at rest, month anchor while scrolling. Filter mode unchanged. Touches `dateRange.ts`, `OwnGalleryView.tsx`, `photo-masonry` (TS types + `PhotoMasonryView.swift`).
**Builds on:** `2026-07-30-mobile-home-filters-design.md` (pill modes, filter summary, city suffix).

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Rest state | `tenant.name` (site/gallery identity), non-interactive |
| Scroll state | Month anchor ("June", other years "June 2025"), city suffix logic unchanged |
| Revert timing | Scroll events idle for 1.5s → fade back to identity |
| Anchor granularity | Dominant month of the visible range (most photos; tie → newer month) |
| Filter mode | Overrides everything: persistent "N · summary", tappable — existing behavior, state machine suspended |
| Out of scope | Tap-to-jump / scrubbing (direction C), avatar or subtitle in identity state, right-side buttons |

## State machine (owned by native)

Priority high → low:

1. **Filter** — `filterActive` true: pill fixed to `chromeDateLabel` (JS already passes `N · summary`), interactive. No identity/date switching.
2. **Date** — drag begins or scroll offset changes: crossfade to month anchor. Once scroll events have been idle for 1.5s (no drag, no deceleration), crossfade back to identity.
3. **Identity (default)** — shows `chromeIdentityLabel`, non-interactive.

Gating: pill hidden during load/empty/error exactly as today (`chromeDateVisible`). If the visible range yields no dated photos (`chromeDateLabel` empty), scrolling does not switch — pill stays in identity state.

## JS: month anchor (`dateRange.ts`)

`formatVisibleDateRange` → `formatVisibleMonthAnchor(photos, startIndex, endIndex, locale)`:

- Bucket photos in `[start, end]` by `(year, month)` of `dateTaken`; skip null/invalid dates.
- Pick the bucket with the most photos; tie breaks to the newer month.
- Format via cached `Intl.DateTimeFormat`: `{ month: 'long' }` for the current year, `{ month: 'long', year: 'numeric' }` otherwise (zh-CN renders "6月" / "2025年6月" natively).
- Returns `null` when no photo in range has a valid date.

`cityForRange` untouched; native keeps appending " · city" only when it fits (`chromeDateDetail` path unchanged).

## OwnGalleryView

- Pass `chromeIdentityLabel={auth.session?.tenant?.name ?? ''}`.
- `chromeDateLabel` now carries the month anchor (filter mode still swaps in `N · summary` as today).
- Visibility gate becomes: show pill when `hasFeed` and (identity label or date label non-empty).

## Native (`PhotoMasonryView.swift` + module TS types)

- New prop `chromeIdentityLabel: String`.
- Native owns the idle timer and state switching — it sees drag/deceleration directly, no bridge latency. Timer restarts on every scroll callback; fires 1.5s after the last one while not dragging/decelerating.
- Transition: existing UIButton configuration crossfade (~200ms); pill width keeps auto-sizing to text.
- `chromeDateInteractive` semantics unchanged (interactive only in filter mode). When `filterActive` is true the state machine is bypassed and `chromeDateLabel` is always shown.
- Width fitting: identity state never appends `chromeDateDetail`; the " · detail" merge applies only in the date state.

## Testing

- Unit (`endpoints.test.mjs`-style node test for `dateRange.ts`): dominant-month pick, tie → newer, year suffix for non-current year, null on undated range, locale formatting smoke.
- Manual on simulator: rest shows tenant name; scroll shows month; stop → 1.5s → identity; filter on → summary persists and taps open sheet; filter cleared → back to state machine; empty/error → no pill.
