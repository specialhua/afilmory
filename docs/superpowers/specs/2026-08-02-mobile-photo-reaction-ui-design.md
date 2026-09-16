# Photo Reaction Rail — UI, Motion and Haptics Design

**Date:** 2026-08-02
**Scope:** Rebuild the photo detail reaction rail around a Dock-style scrub gesture, add a fly-away burst with press-and-hold repeat fire, and give the whole interaction a haptic vocabulary. Batch the resulting claps into a single request.
**Touches:** `apps/mobile/modules/photo-masonry/ios/Detail/PhotoDetailReactionRailView.swift` (+ two new siblings), `PhotoDetailView.swift`, `apps/mobile/src/modules/photo-viewer/{photoReactionState.ts,photoReactionApi.ts,usePhotoReactions.ts,PhotoDetailScreen.tsx}`, `packages/sdk/src/index.ts`, `be/apps/core/src/modules/content/reaction/reaction.service.ts`, `locales/mobile/*.json`.
**Builds on:** `2026-08-01-mobile-photo-detail-ui-design.md` — the toolbar smiley that opens this rail is the one that plan built.

## Problem

Three things are wrong with the rail as it stands.

**1. The UI promises a state the server cannot keep.** The `reactions` table is `(tenantId, refKey, reaction, createdAt)` — no `userId`. `POST /reactions/add` only inserts; there is no delete. Yet the rail paints a selected item with a `systemBlue` 24% fill and lets you tap again to decrement. That state dies the moment you swipe to the next photo while the server row lives on. By contrast `comments` does carry a `userId`, so the asymmetry is not an oversight in the client — reactions are genuinely an anonymous append-only counter.

**2. Sending produces no feedback.** A tap silently ticks a badge. Nothing launches, nothing lands, nothing is felt. Under applause semantics — where the whole point is expressing enthusiasm, repeatedly — this is the most important missing beat.

**3. There are no haptics anywhere in the reaction path.** The app uses them elsewhere (`PhotoMasonryView` scroll snap, Live Photo trigger, profile sheet) but the reaction rail is silent.

## Reference: how Telegram does it

Telegram ships two reaction systems with different semantics, and the well-known one is the wrong model to copy here.

**Normal emoji reactions** are per-user and revocable: long-press a message, a bar scales up above it, picking one flies the emoji into a chip under the bubble; your own chip is filled and tapping it removes your reaction. This requires per-user identity, which the reaction table does not have.

**Star (paid) reactions** are append-only and final. Telegram's own description: *"tap the ⭐️ icon repeatedly to increase the number of Stars – or hold down to set a specific amount."* The API takes a `count` and commits the accumulated total in **one** `messages.sendPaidReaction` call rather than N calls.

That second model is ours. The parts worth taking: repeat-to-accumulate, hold-to-accumulate, and client-side tallying with a single batched submit. The part worth skipping: hold-opens-a-quantity-slider, which exists because real money is at stake — applause does not need a precise amount.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Reaction semantics | Unchanged — append-only, anonymous, no toggle, no per-user identity |
| Trigger path | Unchanged — toolbar smiley opens the rail |
| Rail form | Dock-style magnification with drag-to-select |
| Send feedback | Fly-away emoji particle; press-and-hold streams repeats |
| Repeat fire | Both hold-to-stream **and** repeat-tap-to-accumulate |
| Submission | Client tallies locally, submits once with a `count` |
| Backend change | `count` field on `ReactionDtoSchema`; batch insert in the service |
| Selected state | Deleted; replaced by a 1.2s afterglow |
| Failure UX | Silent rollback + error haptic + a11y announce — no `Alert` |
| Out of scope | Double-tap quick reaction, reaction picker beyond the fixed six, web/SSR rail, `activeReactions` persistence |

## Interaction

### Rail geometry

| Metric | Value |
|---|---|
| Item diameter, at rest | 36pt (was 40) |
| Item diameter, under finger | 48pt |
| Item diameter, immediate neighbours | ~42pt (falls out of the curve) |
| Item spacing | 10pt |
| Lift of magnified item | 12pt |
| Magnification curve | `scale = 1 + A · exp(-(d/σ)²)`, `A = peak/rest - 1`, σ = 1.2 × item pitch |

The rail is **one glass surface**: a single `UIGlassEffect` capsule with the six
reactions on it as plain buttons. Not six `UIGlassEffect` circles inside a
`UIGlassContainerEffect` — that renders as six separate pucks, and closing the gap
enough to fuse them just produces a wobbling liquid blob. One container, one group.
The magnified reaction rises out of the capsule, so neither the effect view nor its
content view may clip.

Items are laid out in the **content view's** coordinate space. Deriving their centre
from `container.frame.midY` instead of `container.bounds.midY` silently drops every
reaction by the container's own offset inside the rail and lands the whole group on
top of the toolbar.

The rest/peak/spacing triple is constrained, not chosen freely: rest positions stay
fixed during a scrub so the index under the finger cannot shift, which means the peak
radius plus its neighbour's radius must still fit inside one pitch. At 36/48/10 that
is 24 + 21 ≤ 46. A more aggressive peak overlaps its neighbour, and overlapping glass
circles trigger the container effect's merge blob. `PhotoDetailReactionGeometryTests`
asserts the constraint so a later tweak to the numbers fails loudly.

Geometry tracks the finger with no follow animation. Any lag desynchronises the visual from the `selectionChanged()` tick and the whole thing stops feeling connected.

**Magnify by changing frames, never by `CGAffineTransform`.** `UIGlassEffect` samples its backdrop; a transform scales that sample rather than re-rendering it, and the glass reads as stretched. Re-laying-out at the new size makes it redraw correctly.

### Gesture state machine

A single `UILongPressGestureRecognizer` with `minimumPressDuration = 0` on the rail — `.began` fires on touch-down and `.changed` follows movement, which is a press-and-drag recogniser. A pan recogniser would need displacement before beginning.

The recogniser lives on the rail, not on the toolbar item: the smiley still opens the rail with a plain tap, and the scrub is a separate gesture afterwards. A touch-down that lands in the container's padding rather than on an item clamps to the nearest item. A touch-down and immediate release with no movement is simply a single send.

```
.began     → x → index, magnify, selection tick, arm 400ms hold timer
.changed   → not streaming: x → index; on crossing an item, tick + re-arm hold timer
             streaming:     ignore x (target locked)
hold fires → enter stream: start engine, trigger transient, start 180ms repeat timer
each 180ms → localCount += 1, emit particle, ramped transient, combo bubble +1, cap at 50
.ended     → stop timer, stop engine, enter merge window
.cancelled → same as .ended
```

`.cancelled` commits rather than discards. Particles have already flown; the visual promise should be honoured.

**The target locks once streaming begins, and the bar collapses to say so.** A rail
that keeps showing six targets while ignoring five of them is an interface lying about
what it accepts. So entering the stream contracts the capsule onto the pressed
reaction — it becomes the single button it actually is, and the constraint needs no
explaining. This keeps a gesture's product to exactly one `{reaction, count}` and one
request; allowing mid-stream switching would make the payload a map and force
partial-failure handling, for an interaction that is awkward anyway once particles are
in flight.

| Collapse | Value |
|---|---|
| Button diameter | 56pt, bottom edge pinned to the capsule's own bottom so it grows upward, away from the toolbar |
| Chosen reaction | scales to 40pt and slides to the button's centre |
| The other five | converge on that same centre, shrink to 0.42, fade out |
| Timing | discrete at the 400ms hold — the bar is still until then, then springs (0.26s, damping 0.68) |
| Return | 0.16s ease-out, no overshoot |

The collapse anchors on the **pressed item's x**, never the rail's centre: what sits
under a held finger must not move out from under it.

Two deliberate rejections. The hold is **not** a progressive charge that contracts as
you hold — a discrete snap keeps the commit crisp and on the same beat as the trigger
haptic, and it avoids a whole interruptible-progress machinery (dwell threshold,
movement reset, geometry interpolated from a 0→1 value). And the other five are
**sucked in**, not faded in place: the capsule and its contents are one body of liquid
contracting, not a shell shrinking while glyphs independently disappear.

Item scale is applied by `transform`, not by font size and bounds — a font change snaps
instantly and would tear away from the animated frame around it.

### The collapsed button

| Element | Behaviour |
|---|---|
| Charge ring | 3pt stroke inset 4pt outside the button, filling clockwise from 12 o'clock as `pendingCount / comboCap`; 0.18s linear per shot, matching the stream interval so it reads as continuous |
| Reaction | stays visible, pulsing to 1.09× and back over 0.14s on each shot |
| Combo count | stays above the button as `×N` |

The ring exists because **the cap is otherwise invisible**: at 50 the count freezes and
the haptic changes character, which reads as the control breaking rather than as a
limit being reached. It also keeps the reaction on screen — swapping the emoji out for
the number would mean not being able to see what you are sending while you send it.

A stream shot must **not** run a full layout pass. The collapse spring is still in
flight on the same views, and rewriting those frames outside its animation block
replaces the running animation and swallows the overshoot. Shots touch only the ring,
the pulse, and the combo label.

**Combo cap is 50 per gesture.** At the cap, visuals and haptics hold at their top state and the count stops rising.

### Merge window

Release does not submit. It opens an 800ms merge window:

- Press and release the same item again inside the window → accumulates into the same tally, window resets
- Touch a different item → flush the previous tally immediately, start a new one
- Window expiry, rail dismissal, photo change, or unmount → flush

Every flush produces exactly one `{reaction, count}`.

## Haptics

Two layers, split on a technical boundary.

**UIKit generators for discrete moments.** These are the system-consistent vocabulary. The scrub tick in particular belongs to `UISelectionFeedbackGenerator` — it exists for exactly this "crossed one detent" case and matches pickers and segmented controls elsewhere in iOS.

**Core Haptics for the stream only.** `UIImpactFeedbackGenerator` calls at 180ms intervals get coalesced and throttled by the system into mush, and it cannot express a smooth intensity ramp — which is the entire point of a stream that gets more intense the longer you hold. `CHHapticEngine` starts lazily when streaming begins and stops when the rail dismisses.

| Moment | Haptic |
|---|---|
| Rail presented | `impact(.soft)` |
| Crossing an item while scrubbing | `selectionChanged()` |
| Single send on release | `impact(.rigid, 0.85)` |
| Entering stream (400ms hold) | Core Haptics transient, `intensity 0.5 / sharpness 0.4` |
| Each stream shot | transient, `intensity 0.5 → 0.95` linear over the first ~20 shots, `sharpness 0.45` fixed |
| Stream at cap | continuous low-frequency bed underneath, top-intensity transients continue |
| Submission failure | `notification(.error)` |

`prepare()` the selection generator on the smiley button's touch-down, not on rail presentation — warming up later makes the first tick arrive late.

**Degradation.** When `CHHapticEngine.capabilitiesForHardware().supportsHaptics` is false (iPad, Simulator) the entire haptic path no-ops and visuals proceed unchanged. The engine's `stoppedHandler` and `resetHandler` must restart it, otherwise an incoming call leaves it permanently dead.

## Motion

### Presentation and dismissal

Presentation staggers per item: `scale 0.4 + opacity 0` → identity, 0.26s spring, 18ms delay per item, left to right. Dismissal does not stagger — 0.16s fade with `scale 0.96` as one unit. Appearing wants texture; disappearing wants to be over.

### Fly-away particle

An emoji `UILabel` spawns at the magnified item's centre and runs a `CAKeyframeAnimation` along a quadratic bezier: 128pt up, ±30pt of random horizontal drift.

| Property | Keyframes |
|---|---|
| scale | `0.5` → `1.18` (first 8%) → `0.6` |
| opacity | `0` → `1` → `0` |
| duration | 1.5s, ease-out |

Streamed particles randomise drift and font size (17–27pt) per shot; identical particles read as a stuck loop. On-screen particles cap at 12, recycling the oldest.

### Counts

At rest, count badges stay where they are — top-right of each item, current metrics. On touch-down **all badges fade out** and the magnified item gets a single large count above it that follows the finger; badges scaling with their circles turn into noise, and while scrubbing only the current item matters. Badges fade back in when the gesture ends, carrying the optimistic totals.

While streaming, that number is replaced by a **`×N` combo bubble** that climbs with each shot. On release the bubble's N folds into the total and the bubble dissipates. This makes "how much did this press produce" legible instead of watching a total jump by an unexplained amount.

### Afterglow replaces the selected state

The `systemBlue` 24% fill is deleted. A just-sent item tints to white 18% and fades back over 1.2s. It says *just now* without promising *persistently* — which is the only claim the server can actually honour.

### Reduce Motion

- Particles: not spawned; the count updates directly
- Staggered presentation: becomes a single fade
- **Magnification is kept** — it is direct manipulation tracking the finger, not decoration. Removing it would leave no indication of what is selected

## Accessibility

The scrub gesture is unusable under VoiceOver, so the rail publishes explicit `accessibilityElements` — one `UIAccessibilityElement` per item, `accessibilityLabel` from the existing `photo.reaction.add`, `accessibilityValue` carrying the count. Activation takes the **single-send** path. Streaming is not offered to VoiceOver; that is an acceptable degradation for an intensity modifier.

## Data flow

### Client state

`photoReactionState.ts` is toggle-shaped throughout and gets replaced:

- Remove `activeReactions`, `toggleLocalPhotoReaction`, `rollbackLocalPhotoReaction`
- Add `addLocalReactions(state, reaction, count)` and `rollbackLocalReactions(state, reaction, count)`
- Replace `activeReactions`' role in merging with `localDeltas: Record<string, number>`

`localDeltas` exists for a real race: the initial `GET /reactions` may land after the user has already clapped, and the snapshot would otherwise clobber the local `+N`. Re-applying the deltas on merge fixes it — the same job `activeReactions` did, promoted from a boolean set to a count map.

A successful submit does **not** re-fetch. The local tally is trusted; an immediate `GET` after `POST` risks reading a stale replica. This preserves current behaviour.

`photoReactionState.test.mjs` is rewritten — its cases are all toggle cases.

### Failure

The current `Alert.alert` is disproportionate: a modal interrupting full-screen photo viewing over one lost clap, in an app with no toast infrastructure to fall back on. Building toast infrastructure for this is not warranted.

Failure instead **rolls the count back silently, fires `notification(.error)`, and announces via `AccessibilityInfo.announceForAccessibility`**. Haptics are a notification channel and this is what they are for; the announcement keeps the information available to assistive tech. `photo.reaction.failed` stays as the announcement string.

The haptic engine lives on the native side, so the failure travels back down as a
`reactionFailureNonce` prop that the hook increments. `PhotoDetailView` buzzes on any
increase and ignores the initial zero.

### i18n

New key `photo.reaction.burst` = `"Sent {{count}} {{reaction}}"`, announced when a flush of `count > 1` succeeds; a flush of `count === 1` keeps `photo.reaction.success`. Added to `locales/mobile/en.json` first, then the other five.

### Backend

`packages/sdk/src/index.ts`:

```ts
export const ReactionDtoSchema = z.object({
  count: z.number().int().min(1).max(50).default(1),
  reaction: z.string().min(1).max(20),
  refKey: z.string().min(1),
})
```

`ReactionService.addReaction(refKey, reaction, count)` inserts N rows in one `db.insert(reactions).values(...)`.

The server-side cap of 50 is the real one; the client combo cap only keeps the UI sane. Zod rejects anything above it before the service runs.

That is the entire backend change — one schema field and one method signature. The semantics are untouched: still append-only, still anonymous.

## Components

| File | Responsibility |
|---|---|
| `PhotoDetailReactionRailView.swift` | Layout, hit testing, gesture state machine, afterglow, a11y elements |
| `PhotoDetailReactionGeometry.swift` | Metrics and the pure scrub maths — the unit-testable part |
| `PhotoDetailReactionBurstLayer.swift` | Particle spawn, animation, recycling, on-screen cap |
| `PhotoDetailReactionHaptics.swift` | UIKit generators, `CHHapticEngine` lifecycle, capability gating |
| `PhotoDetailReactionLabels.swift` | The count badge and the focus/combo label |

The original file was 189 lines; Dock geometry, particles and a haptic engine together would push one file well past the 500-line ceiling. Each of the five is independently readable, and the geometry one is independently testable.

The burst layer is hosted by `PhotoDetailView`, not by the rail: particles travel 128pt
upward and would be clipped by the rail's own bounds. The rail reports a spawn point
through `onEmitParticle` and the detail view converts it into the burst layer's space.
It is inserted **below** the rail — particles rise straight through where the combo
counter sits, and above the rail they hide the one number the gesture exists to show.

The rail also anchors to `toolbar.reactionsItemFrame(in:)`, not to the toolbar's own
frame, so the gap is measured against the glass button the rail belongs to.

**Adding these files requires a `pod install`** — the podspec's `**/*.{h,m,mm,swift}` glob expands to a fixed file list at install time, so new files are invisible to Xcode until then.

## Verification

Automatable:

- `photoReactionState.test.mjs` — accumulate, rollback, and the merge race (`node:test`, run via `pnpm exec tsx --test`)
- Merge-window tally logic extracted as a pure function with an injected clock, unit tested without real timers
- Dock geometry (x → index, magnification curve) extracted as pure functions, tested in `apps/mobile/modules/photo-masonry/ios/Tests/` alongside `CommentsStateTests.swift`
- `pnpm --filter core exec vitest run` for the reaction service's batch insert

Device-only checklist — the Simulator has no haptics and its glass rendering is not representative:

- [ ] Scrub across all six items: one tick per crossing, none while stationary
- [ ] Hold 400ms: stream starts, intensity audibly ramps over the first ~20 shots
- [ ] Hold past the cap: intensity holds, continuous bed engages, count stops at 50
- [ ] Release mid-stream: particles finish, combo folds into the total, one request in the log
- [ ] Repeat-tap the same item three times inside 800ms: one request with `count: 3`
- [ ] Tap a different item inside the window: previous tally flushes immediately
- [ ] Airplane mode: count rolls back, error haptic fires, no `Alert` appears
- [ ] Incoming call mid-stream, then resume: engine restarts, haptics still work
- [ ] VoiceOver: six elements, labels and counts announced, activation sends one
- [ ] Reduce Motion: no particles, magnification still tracks
- [ ] Glass legibility of the magnified item over both a blown-out sky and a dark frame
