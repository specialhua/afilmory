# Profile Sheet — Native Identity + Account Hub — Design

**Date:** 2026-07-31
**Scope:** Replace the RN `ProfileSheet` (avatar tap on the photos header) with a native SwiftUI sheet presented via `PhotoSheetsModule`, styled as a mini profile (photo-strip cover + stats) plus account actions. Touches `photoSheets.ts`, `PhotoSheetsModule.swift` (+ new Swift views), `OwnGalleryView.tsx`; deletes `ProfileSheet.tsx` and `profileSheetPage.ts`.
**Builds on:** the native sheet pattern from `feat(mobile): add native photo info and filter sheets`.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Positioning | Account hub + mini profile preview (settings tab is gone; this is the only account surface) |
| Visual core | Horizontal photo-strip cover from home feed, avatar overlapping its bottom edge, identity block, one stats line |
| Settings absorbed | Clear image cache only — no appearance/language switches |
| Implementation | Native SwiftUI sheet via `PhotoSheetsModule` (route B), RN ProfileSheet deleted |
| Detent | Single `.medium`, grabber visible, no navigation bar (strip bleeds to the rounded top) |
| Sign out | Destructive row → native `confirmationDialog` → resolve `'signOut'` and dismiss |
| Cache clearing | Fully native via `SDImageCache` (shared with expo-image on iOS — same cache) |

## Bridge (`src/native/photoSheets.ts` + `PhotoSheetsModule.swift`)

New `presentProfile` following the existing session pattern:

- JS: `presentNativeProfile(payload): Promise<'signOut' | null>`.
- Payload assembled in JS: user name, avatar URL, initial fallback, tenant name + slug, full web URL (`https://{slug}.{SAAS_BASE_DOMAIN}`), strip items (latest ≤12 photos as `{url, thumbHash, aspectRatio}` from `homeFeedStore`), pre-formatted stats line, all localization strings (native does no i18n or string composition).
- Promise semantics mirror `PhotoFilterSheetSession`: sign-out confirm resolves `'signOut'` then dismisses; swipe-down dismissal resolves `null`. JS runs `signOut()` on `'signOut'`.
- "Open on web": native `UIApplication.shared.open(url)` — no JS round-trip.
- "Clear cache": native `SDImageCache` — no JS round-trip.
- Cleanup: delete `ProfileSheet.tsx` + `profileSheetPage.ts`; `OwnGalleryView.openProfile` calls the bridge and handles `'signOut'`.

## Layout (SwiftUI)

```
╭──────────────────────────╮
│ [photo][strip][cover]    │  latest ≤12, fixed height ~120pt, equal-width
│          ╭────╮          │  crops, thumbhash placeholders, static
│──────────│ 👤 │──────────│  avatar 72pt circle over the strip's bottom
│          ╰────╯          │  edge, ring stroked in sheet background color
│         Innei            │  user name, 17pt semibold
│    Gallery · innei       │  tenant · slug, secondary
│  1,234 · 3 cams · 5 lenses · 2019–2026  │  stats line, muted
│ ┌──────────────────────┐ │
│ │ 🌐 Open on web        │ │  inset grouped list style
│ │ 🗑 Clear cache  123 MB │ │  trailing current usage
│ │ ⎋ Sign out (red)      │ │
│ └──────────────────────┘ │
╰──────────────────────────╯
```

- Strip photos load via SDWebImage (same stack as `PhotoCell`), thumbhash placeholders for consistency with the masonry.
- Empty feed: strip hidden, avatar sits in normal top position, stats line hidden.
- No avatar image: initial-letter circle fallback (same logic as masonry chrome).

## Behavior

- **Cache row:** on present, read `SDImageCache.shared.totalDiskSize()` and show formatted size; tap → `clearMemory()` + `clearDisk()` → row animates to a cleared state with size zero + light haptic. No confirmation (recoverable action).
- **Sign out:** red destructive row → `confirmationDialog`; confirm resolves `'signOut'` and dismisses; JS then signs out (home screen reacts to auth state change — no in-sheet spinner).
- **Stats line:** computed in JS from the home feed (photo count, camera count, lens count via `buildFilterOptions`; year span from `dateTaken`), formatted into one localized string in a pure helper (`profileStats.ts`), passed whole to native.

## Testing

- Node unit tests (`*.test.mjs` style) for `profileStats.ts`: normal span, single year, photos without dates, empty feed.
- Manual on simulator (axe): open sheet → strip/avatar/stats render; clear cache → size drops to zero with animation; sign out → dialog → confirm signs out; swipe-down resolves null (no action); empty gallery → stripless layout.
