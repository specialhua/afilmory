# Mobile Sign-In Page — Design

**Date:** 2026-07-29
**Scope:** Visual redesign of the mobile sign-in sheet: photo-immersive slow-scrolling masonry backdrop + branded provider buttons. Auth logic (broker, sessionStore) is untouched.
**Builds on:** `2026-07-29-mobile-oauth-own-gallery-design.md`, `2026-07-29-mobile-login-broker-design.md`.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Direction | Photo-immersive: real community photos as the hero visual |
| Photo source | Remote featured-gallery thumbnails; dark gradient fallback when unavailable |
| Presentation | Keep `pageSheet` (no fullscreen) |
| Photo form | Slow-scrolling 3-column masonry collage, fading into the lower brand area |
| Animation | Reanimated seamless loop on the UI thread (per-column `translateY` cycle) |

## Layout (top → bottom inside the sheet)

- **Showcase area (~52% of sheet height):** 3 equal-width masonry columns, 6px gap, photo corner radius 6 (`radius`), aspect ratios preserved. Photos reach the sheet top edge (clipped by the sheet's own corners; system grabber floats over them). A `LinearGradient` (transparent → `bgCanvas`, ~96px tall) overlays the bottom of the area so photos dissolve into the brand area.
- **Brand area:** left-aligned — app icon (`assets/images/icon.png`, 36×36 rounded), title **Afilmory** (22pt/700), one-line subtitle (keeps the "Use the account that owns your gallery." tone).
- **Buttons:** two provider buttons, `controlH` height, `radiusLg` corners, `bgElement` background + hairline border; content is `logo + "Continue with GitHub/Google"` centered. GitHub mark is a monochrome PNG tinted via `tintColor` (white in dark, black in light); Google "G" is the full-color official PNG (brand rules forbid recoloring). Busy provider swaps its label for an `ActivityIndicator`; the other button dims and disables.
- **Error text:** below buttons, `danger` 13pt, max 3 lines, space reserved so appearance doesn't shift layout.
- **Theming:** photos are theme-agnostic; everything else uses the existing `palette`, so dark/light both work. Gradient fade uses `bgCanvas` per theme.
- **Loading/empty:** before pool metadata arrives, the showcase is a quiet gradient; once metadata lands, masonry cells render decoded thumbHash placeholders and each thumbnail fades in over them as it loads. Empty pool (offline / all fetches failed) keeps the gradient permanently, with no error surface — photos are ambience, not a feature.

## Data flow

- New `useShowcasePhotos` hook in `modules/auth/`: `fetchFeaturedGalleries()` → take first 4 galleries → concurrently fetch each gallery's `/api/manifest/photos/search` with `limit: 8` (via a new limit-parameterized fetcher in `galleries/api.ts`) → merge into a pool.
- Interleave round-robin across galleries (avoid same-author clumping), cap at 24 photos.
- Failed galleries are skipped silently; total failure → empty pool → gradient fallback. No retry, no error UI.
- Module-level cache: one successful pool per app run; reopening the sheet does not refetch.

## Animation (Reanimated)

- Pool is round-robin assigned to 3 columns (~8 each). Column width = (sheet width − padding − 2×6) / 3; per-photo height from `aspectRatio`; summed → content height H.
- Each column renders its content twice, stacked; `translateY` runs `withRepeat(withTiming(-H, { duration, easing: linear }), -1)` — at −H the frame is identical to 0, so the loop is seamless.
- Parallax by speed difference: all columns scroll upward at ~12–16 px/s with cycle durations around 80s / 100s / 90s.
- If content height < 2× showcase height (tiny pool), repeat photos until it is, then loop.
- `useReducedMotion()` → static collage, no scrolling.
- Sheet dismissal unmounts the component; animations die with it.

## Files (`apps/mobile/src/modules/auth/`)

| File | Action | Responsibility |
|---|---|---|
| `ShowcaseMasonry.tsx` | new | Slow-scroll columns + gradient fade + thumbHash placeholders + reduced-motion fallback; pure presentational, receives the pool |
| `useShowcasePhotos.ts` | new | Pool fetching + module-level cache |
| `SignInScreen.tsx` | edit | Assemble: ShowcaseMasonry / brand area / SignInSection |
| `SignInSection.tsx` | edit | Buttons-only: branded provider buttons + busy + error (title/subtitle move to the Screen's brand area) |

Supporting changes:

- `galleries/api.ts`: add a limit-parameterized preview fetcher; `fetchGalleryCovers` delegates to it with limit 3 (behavior unchanged).
- New dependency: `expo-linear-gradient`.
- New assets: `assets/images/github-mark.png` (official monochrome mark), `assets/images/google-g.png` (official full-color G) — sourced from the providers' brand asset downloads at implementation time.
- `SignInSection` is only imported by `SignInScreen`, so the restructure has no external impact.

## Error handling

- Sign-in failure: unchanged — danger text under the buttons. New: a user-cancelled OAuth (browser dismissed) is not an error and shows no text.
- Showcase failure: silent degradation (above).

## Verification

- `pnpm --filter @afilmory/mobile type-check` + scoped lint on changed files.
- Simulator: open the sheet — masonry scrolls smoothly with no visible seam; airplane mode + reopen — gradient fallback; dark and light themes; one full GitHub sign-in regression; system Reduce Motion on — static collage.

## Out of Scope

- Fullscreen presentation, onboarding/walkthrough screens, email+password login, photo attribution overlays, backend changes.
