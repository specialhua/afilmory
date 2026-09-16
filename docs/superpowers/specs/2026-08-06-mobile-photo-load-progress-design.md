# Mobile Photo Original-Load Progress Pill — Design

**Date:** 2026-08-06
**Scope:** Show a progress indicator in the native photo preview while the original image downloads. Today `PhotoViewerCell` loads the original (`photo.originalUrl`) silently (`progress: nil`); on cloud-backed galleries the user stares at the thumbnail with no feedback. Web already solves this with a bottom-right pill (`apps/web/src/modules/inspector/LoadingIndicator.tsx`); this brings the same UX to iOS, natively.
**Touches:** `apps/mobile/modules/photo-masonry/ios/Viewer/PhotoViewerCell.swift`, `apps/mobile/modules/photo-masonry/ios/Viewer/PhotoViewerView.swift`, `apps/mobile/modules/photo-masonry/ios/Detail/PhotoDetailView.swift`, new `apps/mobile/modules/photo-masonry/ios/Detail/PhotoDetailLoadingPillView.swift`, `apps/mobile/modules/photo-masonry/ios/Tests/**`, `locales/mobile/*.json`. RN code is untouched.

## Problem

Entering the preview shows thumbhash → thumbnail → original, but the original download (often several MB from S3) reports nothing. SDWebImage already exposes `(receivedSize, expectedSize)` through the `progress:` parameter that `loadTier` currently passes as `nil` — the data is free; only the surface is missing.

## Design

### Behavior

- **First entry / paging to a photo:** when the tier-1 original load starts, the pill appears after a **350 ms delay** — disk-cache hits and fast loads never flash it. On completion it fades out.
- **Zoom-triggered tier 2–4 upgrades:** pill appears only after a **1 s delay**. Tier upgrades re-decode the already-downloaded original from SDWebImage's disk cache (no network), so in practice this only surfaces for pathologically slow decodes.
- **Paging:** the pill reflects the active photo only. On index change the pill resets immediately; neighbor-preload progress is not forwarded. Each cell retains its latest load state and re-emits it on `setActive(true)`, so paging onto a mid-load photo picks up where it is (subject to the 350 ms delay from the re-emit).
- **Unknown total size** (`expectedSize <= 0`): hide the percent and total; show only received bytes ("2.1 MB") and switch the ring to an indeterminate spinner.
- **Failure:** error state (red warning icon + failure text) holds for 2.5 s, then fades.
- **Chrome independence:** the pill ignores nav/toolbar visibility — it stays visible while chrome is hidden. Position is fixed; it does not track chrome animation.

### UI

- Bottom-right: 16 pt right margin, bottom edge 12 pt above the toolbar top (`toolbarY` from `layoutChrome`). Fixed position.
- iOS 26 `UIGlassEffect` capsule, non-interactive (`isInteractive` stays off; the view ignores touches entirely).
- Content: 20 pt determinate progress ring on the left (`CAShapeLayer` strokeEnd, white on white/20 track), two text lines on the right:
  - Line 1: `Loading original 64%` — 13 pt semibold, tabular-nums percent.
  - Line 2: `5.4 MB / 8.4 MB` — 11 pt, 70% white.
- Show/hide: opacity + scale 0.95→1 spring.
- Z-order: above scrims, below `reactionRail`/`reactionBurst` (the rail is transient and user-invoked; brief overlap is acceptable).
- Strings via native `Localization.t()`. New flat keys in all six `locales/mobile/*.json`: `photo.loading.original` ("Loading original"), `photo.loading.failed` ("Failed to load original"). Percent and byte strings are formatted numerically (one-decimal MB), not localized templates.

### Architecture

- **`PhotoViewerCell`:** `loadTier` passes a real `progress:` closure. SDWebImage calls it on a background queue → dispatch to main, filter by `photo.id` and tier (same guards as the completion). The cell publishes a snapshot `PhotoOriginalLoadState` (`idle` / `loading(tier, receivedBytes, expectedBytes)` / `finished` / `failed`) through `onOriginalLoadStateChange` and retains the latest value. `prepareForReuse`/`configure(mediaChanged)` reset it to `idle`.
- **`PhotoViewerView`:** wires the cell closure alongside the existing `onZoomStateChange` pattern, forwards only states whose cell represents the current photo, and exposes `onActivePhotoLoadStateChange`. On index change, `updateActivePhoto` re-emits the new current cell's retained snapshot (or `idle`), which both resets stale UI and resumes a mid-flight load.
- **`PhotoDetailView` + `PhotoDetailLoadingPillView` (new file):** the pill view owns the presentation state machine — 350 ms / 1 s appearance delays (`DispatchWorkItem`), 2.5 s error hold, fade animations. `PhotoDetailView` only positions it in `layoutChrome` (inside a non-interactive host layer that the open/dismiss transitions fade) and feeds it states. Ring updates run inside `CATransaction.setDisableActions` — rapid progress bursts otherwise pile up implicit 0.25 s animations and the arc lags far behind the label.
- The show/hide decision logic lives in a pure, UIKit-free type (injected clock) inside the pill file so the test target can drive it.
- New `.swift` file ⇒ `pod install` before the Xcode build sees it.

## Testing

1. Swift unit tests in `Tests/`: completes-within-350 ms never shows; tier-upgrade uses the 1 s threshold; unknown total switches to indeterminate; paging resets; failure hides after the hold.
2. `pod install`, `pnpm --filter @afilmory/mobile ios` build.
3. Simulator: clear SDWebImage cache, open a cloud photo, verify pill appearance/position/dismissal via axe + `simctl` screenshots; verify no pill on cached re-entry; verify chrome-hidden visibility.
