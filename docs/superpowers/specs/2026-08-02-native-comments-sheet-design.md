# Native Comments Sheet — Design

**Date:** 2026-08-02
**Scope:** Introduce a systematic native API layer — a shared session registry plus a typed request client — and replace the React Native photo comments screen with a native SwiftUI sheet built on it. The comments sheet is the API layer's first real consumer, which is why they share a spec: an abstraction designed without one tends to be the wrong abstraction.
**Touches:** `apps/mobile/modules/photo-masonry/ios/**`, `apps/mobile/modules/photo-masonry/PhotoMasonry.podspec`, `apps/mobile/src/api/auth.ts`, `apps/mobile/src/modules/comments/**`, `apps/mobile/src/modules/photo-viewer/PhotoDetailScreen.tsx`, `apps/mobile/src/pages.ts`, the local dev seed script.
**Builds on:** `2026-08-01-mobile-photo-detail-ui-design.md` — the toolbar button that opens this sheet is the one that plan rebuilt.

## Problem

The photo comments screen is 2004 lines of TypeScript, `PhotoCommentsScreen.tsx` alone being 1181. It is the last major RN surface reachable from the photo detail page, which is now entirely native.

Two concrete defects motivate moving rather than polishing:

1. **`commentState.ts` crashes under Hermes.** `formatCommentRelativeTime` constructs `Intl.RelativeTimeFormat`, which Hermes does not ship — verified by `nm` on the linked hermesvm binary, which exports only Collator, DateTimeFormat and NumberFormat. Unlike the photo header's version of this bug, it hits the constructor **unconditionally for every parseable timestamp**, not only recent ones. It is latent solely because no seeded photo has comments. Swift's `Date.RelativeFormatStyle` makes the whole class of bug disappear.
2. **Keyboard avoidance.** A comment composer is the hardest thing to get right in RN and free in SwiftUI via `.safeAreaInset(edge: .bottom)`.

Separately, the native side already has one ad-hoc networking implementation. `UploadCenter` resolves its base URL from a passed string, reads the cookie from its own private `UploadCookieStore`, and carries its own retry ladder. Comments would be the second such implementation, and the page after that the third. The cookie in particular would become a third source of truth alongside JS's and upload's.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Data layer | Swift owns networking — fetch, paginate, create, react |
| Native networking | One shared `AfilmoryAPI` client for foreground request/response; every native feature uses it |
| Background uploads | Keep their own background `URLSession` — **not** absorbed into the shared client |
| Auto-retry | Off by default; opt-in per endpoint, GET only. Never POST |
| Session plumbing | Shared native registry, written from JS's single `setAuthCookie` choke point |
| Base URLs | JS registers **resolved** platform and active-tenant URLs; only a non-active gallery passes one per call |
| Visual target | Rebuilt to iOS idiom, not a port of the current design |
| Reply | Left swipe action |
| Like / copy | Long-press context menu; the count badge is display-only |
| Send animation | Native `List` insert; `CommentSendFlight` deleted |
| Integration | `presentPhotoComments` async function + `SheetPromiseSession` |
| Comment count badge | Stays fed from JS |
| Pure-function tests | Preserved via a new `test_spec` on the podspec |
| Out of scope | `StudioCommentsScreen` (moderation), comment editing/deletion, multi-emoji reactions |

## Phase 0 — Session registry and the shared API layer

**Gates everything else, and its risk is not comments — it is the upload pipeline.**

Today the native side has exactly one networking consumer (`UploadCenter`) and it rolls its own: base URL from a passed string, cookie from a private keychain store, its own retry ladder. Comments would be the second. Without a shared layer, the third native page is the third implementation.

| File | Responsibility |
|---|---|
| `AfilmorySessionStore.swift` | Keychain-backed cookie + resolved base URLs; `register` / `clear` / `current` |
| `AfilmorySessionModule.swift` | JS bridge: `registerSession` / `registerEnvironment` / `clearSession` |
| `APIEndpoint.swift` | Path, method, query, body, and which base URL it belongs to |
| `APIError.swift` | The shared error taxonomy |
| `AfilmoryAPI.swift` | `request<T: Decodable>(_:) async throws -> T` |

### The boundary that must not be crossed

`UploadCenter` keeps its own background `URLSession` — a configuration with an identifier, a delegate, and the ability to outlive the process. That is a fundamentally different mechanism from foreground request/response, and forcing it through the shared client would break the one thing background uploads exist to do. Upload shares the **session registry** and the **error taxonomy**, not the transport.

`UploadCookieStore` is deleted and `UploadCenter` reads the shared store. Its retry ladder stays where it is: it is domain-specific — it treats even a 2xx as retryable because an SSE stream can end without a terminal event — and does not generalise.

### Base URLs without duplicated logic

JS registers **resolved strings**, never templates: `{ platformBaseUrl, tenantBaseUrl }`. This is what keeps `normalizeTenantSlug` and the origin-building rules from being reimplemented in Swift, where they would silently drift. Register only what something reads — no active-tenant slug, since the caller already decides which base URL an endpoint belongs to.

`registerEnvironment` must be called again whenever the active tenant or the environment changes, not only at boot. A stale `tenantBaseUrl` sends native requests to the previous workspace, which fails as a confusing 404 rather than an obvious error.

So `APIEndpoint` supports `.platform` and `.tenant` with zero duplication, and an explicit per-call base URL for the remaining case: a gallery that is not the active tenant. The comments sheet is that case, which is why its contract still carries `baseURL`.

### Error taxonomy

```swift
enum APIError: Error {
  case unauthorized              // 401, its own case
  case http(status: Int, body: String?)
  case transport(Error)
  case decoding(Error)
  case cancelled
}
```

`unauthorized` is separated because every native feature's correct response to it is identical: stop, and hand control back to JS, which owns authentication.

### Rules the client enforces

- **No automatic retry by default.** Opt-in per endpoint, and **GET only**. Auto-retrying `POST /comments` posts duplicate comments. This is a rule, not a default to be tuned later.
- Decoding is `.convertFromSnakeCase`, replacing the JS `camelCaseKeys` helper.
- Cancellation rides Swift structured concurrency — cancelling the `Task` cancels the request. Do not build an `AbortSignal` equivalent.
- The cookie is attached from the registry, never passed by callers.

### Session write path

JS changes in exactly one place: `api/auth.ts`'s `setAuthCookie()` mirrors every write to native, **including `null` → `clearSession`**. It is the single write choke point — `sessionStore` calls it on sign-in, sign-out and refresh — so nothing can drift.

**Security requirement, not optional:** sign-out must clear the keychain. Today `setAuthCookie(null)` clears only a JS in-memory variable. A keychain-backed native copy that survives sign-out is a real privilege window.

### Verification

Comments do not exist yet, so this phase is verified against the upload pipeline. Background uploads must still resume after the app is killed — the reason the store is keychain-backed at all. Folding it in wrongly breaks the just-completed upload work in the hardest way to reproduce. **Phase 0 does not pass until a kill-and-resume upload is observed.**

## Phase 1 — Two prerequisites

Independent of each other; both block the sheet.

**1a. Comment fixtures.** The local dev seed creates no comments, so the sheet cannot be exercised at all. Add comments to the seed: several photos with none, one with a handful, one with enough to page (>20), at least one threaded reply, at least one with reactions, and at least one authored by the seeded viewer so the "own comment" path renders.

**1b. Swift test infrastructure — a spike.** The project has no Swift test target anywhere. Add a `test_spec` to `PhotoMasonry.podspec` and prove it runs, with one trivial assertion plus a real test over something that already exists — `PhotoDetailChromeVisibility`'s derivation table is a good candidate, being pure and currently untested.

The comment state functions do not exist yet; they arrive in Phase 2 and bring their own tests. **This phase establishes the target, not the coverage** — otherwise Phase 2 discovers mid-flight that there is nowhere to put a test.

This is a spike: if a `test_spec` on an Expo local module cannot be made to run cleanly in this project, **report rather than fight it**. The fallback is accepting the coverage loss, and that is a decision to surface, not to make silently.

## Phase 2 — The sheet

### Files

| File | Responsibility | Est. |
|---|---|---|
| `CommentModels.swift` | `Decodable` models + request Record + localization | ~120 |
| `CommentsAPI.swift` | Three `APIEndpoint` definitions — no transport code | ~40 |
| `CommentsState.swift` | The five pure functions, no side effects | ~130 |
| `CommentsStore.swift` | `@Observable` state, calls API + pure functions | ~180 |
| `PhotoCommentsSheetView.swift` | List, empty/error/loading states, sign-in gate | ~180 |
| `CommentRowView.swift` | One comment | ~150 |
| `CommentComposerView.swift` | Input bar | ~120 |

Plus `AsyncFunction("presentPhotoComments")` in `PhotoSheetsModule.swift`.

`CommentsState` is deliberately separate from `CommentsStore`: the pure merge/settle/toggle logic is what Phase 1b tests, and it must not require a live store to exercise.

### Bridge contract

```swift
struct PhotoCommentsSheetRequest: Record {
  @Field var gallerySlug: String = ""
  @Field var photoId: String = ""
  @Field var photoTitle: String = ""
  @Field var baseURL: String = ""
  @Field var viewerUserId: String? = nil   // nil = signed out
  @Field var localizationJSON: String = ""
}
```

Resolves with `{ commentCount, requestedSignIn }`. The count lets the detail page update its badge without a second request; `requestedSignIn` hands routing back to JS, which owns the sign-in flow.

No `cookie` field — Phase 0 supplies it.

### Presentation

`UIHostingController` + `UISheetPresentationController`, detents `[0.62, 0.92]` expressed as `.custom` to preserve the current feel, grabber visible.

### List

SwiftUI `List` with **`.listStyle(.plain)`** — comments are a feed. (The info inspector uses `.insetGrouped` because it is a form; using it here would read as settings.)

Row: circular `AsyncImage` avatar · author name and relative time on one line · body below · a "replying to X" reference line above the body when `parentId` is set · a like badge trailing, only when the count exceeds zero.

- Pull to refresh: `.refreshable`
- Pagination: last row's `onAppear` loads the next page when `nextCursor != nil`
- Empty and error states: `ContentUnavailableView` with retry
- Loading: `.redacted(reason: .placeholder)` skeleton rows

Relative time uses `Date.RelativeFormatStyle`, which is locale-aware natively. This avoids the trap the previous project fell into, where replacing `Intl.RelativeTimeFormat` with i18n keys silently regressed five locales.

### Interaction

| Action | Gesture |
|---|---|
| Reply | Left swipe action |
| Like / unlike | Long-press context menu |
| Copy body | Same context menu |

The like badge is **display-only**. One action, one entry point — a visible button plus a hidden gesture for the same thing is the ambiguity this redesign exists to remove.

### Composer

Mounted via `.safeAreaInset(edge: .bottom)`, so keyboard avoidance is the system's problem.

- `TextField(axis: .vertical)` with `.lineLimit(1...5)`
- Send button `arrow.up.circle.fill`, disabled when empty or over the 1000-character limit
- Reply state: a bar above the field showing the target and a cancel control
- Character counter appears only near the limit

When `viewerUserId` is nil the composer is replaced by a sign-in button, which resolves the promise with `requestedSignIn: true`.

### Data layer

| Endpoint | Returns |
|---|---|
| `GET /comments?photoId=&cursor=&limit=20` | `CommentPage` |
| `POST /comments {content, photoId, parentId?}` | `CommentPage` — note: a page, not a single item |
| `POST /comments/{id}/reactions {reaction}` | `{ item }` |

All three go through `AfilmoryAPI` as `APIEndpoint` values carrying the sheet's per-call `baseURL`. `CommentsAPI` contains no `URLSession` code, no cookie handling and no decoding configuration — if it grows any, the shared layer is missing something and that is the thing to fix.

Optimistic create inserts a row with a client id and a sending state, settles it against the server response by that id, and removes it on failure.

**Do not enable retry on create or react.** Both are POSTs; a retry duplicates a comment or double-toggles a reaction. Only the list endpoint is a candidate, and only if a real need appears.

### Error handling

| Failure | Behaviour |
|---|---|
| Initial load | `ContentUnavailableView` + retry |
| Load more | Footer error row + retry |
| Send | Remove the optimistic row, inline error banner |
| Reaction | Revert the local toggle, inline error |
| **`APIError.unauthorized`** | Stop, show a re-authenticate message, resolve with `requestedSignIn: true` |

401 is a failure mode created by moving networking native: JS owns authentication and Swift holds only a cookie snapshot, so Swift cannot refresh it. **Do not implement token refresh in Swift** — that would split authentication across two languages. Hand it back to JS, which already has the flow.

This is why `unauthorized` is its own case in the shared taxonomy rather than a status code every feature re-inspects: the response is the same everywhere, and it should be impossible to forget.

## Deletion list

| File | Lines |
|---|---|
| `PhotoCommentsScreen.tsx` | 1181 |
| `usePhotoComments.ts` | 262 |
| `CommentSendFlight.tsx` | 167 |
| `commentState.ts` + `commentState.test.mjs` | 119 + tests |
| `CommentBubble.tsx` | 86 |
| `photoCommentsPage.ts` | 30 |

Also: trim `api.ts` to `count` (and `httpStatus` if still used), drop the `photoComments` entry from `pages.ts`, and swap `present(photoCommentsPage, …)` for `presentPhotoComments(…)` in `PhotoDetailScreen.tsx`.

`types.ts` survives only if `usePhotoCommentCount` still needs it — check rather than assume.

The `comments.*` i18n keys are **not** deleted. They move from RN consumption into the localization payload passed to Swift.

## Testing

1. **Phase 0** — background upload resumes after the app is killed. This is the gate.
   Also verify the security requirement directly: sign out, then confirm the keychain
   entry is gone rather than merely unread.
2. **Phase 1b** — `test_spec` runs at all, proven against existing pure code.
3. **Phase 2 tests**, in the target Phase 1b established: the five pure comment-state
   functions — merging a page including dedup against existing ids, settling an
   optimistic comment by client id, removing a failed optimistic comment, toggling a
   reaction locally in both directions, and cursor advancement — plus `APIError`
   classification, particularly that 401 maps to `unauthorized` rather than the
   generic `http` case.
4. **Static** — `pnpm --filter mobile type-check`, ESLint scoped to changed files only.
5. **Simulator, against the local seeded stack with the new fixtures** — load, paginate past 20, pull to refresh, send, reply via swipe, like via context menu, copy, the signed-out gate, and each error path including a forced 401.
6. **Accessibility** — VoiceOver over rows, the composer, and the context menu. Note that VoiceOver could not be enabled on the simulator during the previous project; if that persists, say so rather than claiming a pass.
