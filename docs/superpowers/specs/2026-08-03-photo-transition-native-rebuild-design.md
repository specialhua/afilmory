# Photo Transition — Native Rebuild

**Date:** 2026-08-03
**Scope:** Rebuild the photo opening and dismissal transition on standard UIKit custom-transition machinery, now that React is no longer in the presentation path. Host the photo pages as real child view controllers instead of views inside an RNScreens screen.
**Co-requisite of:** `2026-08-03-mobile-native-data-and-detail-design.md` — that spec introduces the native present; this one rebuilds what the native present makes obsolete. They are implemented together, not in sequence.
**Supersedes:** rows 16, 17, 21, 23 and 27 of the decision table in `2026-08-02-photo-dismiss-gesture-design.md`. Every other row of that spec stands.
**Touches:** `apps/mobile/modules/photo-masonry/ios/{Core,Detail,Viewer,Masonry,Pages,Tests}/**`, `PhotoMasonry.podspec`.

## Problem

The current transition is not a photo transition with some glue around it. It is a photo transition wrapped in several hundred lines of defensive machinery whose only purpose is to survive React driving the navigation.

The defence exists because three things are unknowable from Swift today: when the route push commits, when `PhotoDetailView` actually mounts, and whether RNScreens will detach the screen underneath. So the code freezes the world and waits.

| Machinery | Lines | Why it exists |
|---|---|---|
| `PhotoTransitionRegistry` | 108 | Snapshot the whole window at touch-up so a React route commit cannot expose an intermediate frame |
| `PhotoPresenterSnapshotView` | ~74 | Hand the frozen presenter bitmap back to the live hierarchy (`coverLandingSlot`, `beginPresenterHandoff`) |
| `findScreen() -> RNSScreen?` | `PhotoViewerView.swift:411` | Walk the view tree to find the RNScreens screen |
| `disableCloseTransition()`, `configureRouteTransition()` | `:374-388`, `:467` | Null out `preferredTransition` and `stackAnimation` so RNScreens does not add a second animation |
| `presenterScreenView()` | `:473` | Reach into `navigationController.viewControllers` for the previous view controller's view |
| `pushScreenTraits()` | `:366` | Write status bar and home indicator state onto `RNSScreenView` properties |
| `openingFallbackWorkItem` | 1.2 s | Give up waiting for a mount that may never come |
| Registry snapshot cleanup | 2 s | Same, from the other side |
| `isOpeningPhoto` / JS `openingRef` | 0.6 s each | Debounce a tap whose effect takes an unknown time to appear |

The measured 69.8 ms open has already been traced: 11.5 ms of it is that window snapshot, and the rest is the React round trip the data spec removes. Once the detail view controller is presented directly from `didSelectItemAt`, it can be laid out synchronously before the animation begins — **an intermediate frame becomes impossible, and the snapshot loses its reason to exist.** So do the fallback timers: there is nothing left to time out on.

## Goals

1. Open and dismiss run on `UIViewControllerAnimatedTransitioning` and `UIPercentDrivenInteractiveTransition`.
2. The presenter stays live throughout. No frozen bitmap, no painted placeholder slot, no handoff.
3. No Swift code references RNScreens.
4. The visual design is unchanged — same geometry, same choreography, same commit rule.

## Non-goals

- The system zoom transition. `2026-08-02-photo-dismiss-gesture-design.md:9` already evaluated and rejected it: it treats the entire screen as the shared element, scaling backdrop and chrome together, while this design needs the presenter stationary and only the photo moving. That rejection is about visual semantics and is unaffected by React leaving.
- Scrolling the masonry to reveal an off-screen source cell on dismissal. Apple Photos does this; the current fallback drifts the photo out along the gesture instead. Keep current behavior — this is a port.
- Making native the app root. The tab container stays `NativeTabs`.

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| Transition machinery | Standard UIKit custom transitions, interactive dismissal included |
| Page hosting | Real child view controllers via containment, not views inside an RNScreens screen |
| Photo detail presentation | Modal, `modalPresentationStyle = .custom` with a custom `UIPresentationController` |
| Gallery detail presentation | Native push on the page's own `UINavigationController` |
| Tab container | Unchanged (`NativeTabs`) |
| Visual design | Unchanged from `2026-08-02-photo-dismiss-gesture-design.md` |

## Hosting

Each photo page becomes a `UIViewController` that the React screen adopts once through containment — `addChild`, add view, `didMove(toParent:)`. The RNScreens screen degrades to an inert host that Swift never inspects.

This is what makes everything else possible:

- The page can present a modal from itself, so no navigation controller is borrowed and no delegate is contested.
- Status bar and home indicator become `prefersStatusBarHidden` and `prefersHomeIndicatorAutoHidden` overrides with `setNeedsStatusBarAppearanceUpdate()`, replacing the writes into `RNSScreenView`. The detail modal sets `modalPresentationCapturesStatusBarAppearance = true` so it owns the bar while presented.
- Rotation and trait-collection callbacks arrive normally instead of being inferred from view-tree position.
- `s.dependency 'RNScreens'` leaves the podspec.

### Why modal rather than push, for the detail

Modal presentation with a custom presentation controller keeps the presenting view controller in the window for the duration. The presenter being alive and stationary while only the photo moves is the entire visual thesis of the existing design — modal presentation gives it for free, where a push would remove the presenter from the hierarchy and force the snapshot machinery back.

The gallery detail is different: it is hierarchical navigation with a nav bar and a system-standard animation, so it pushes on the page's own navigation controller and needs no custom delegate.

## Transition

`PhotoTransitionDelegate` vends three objects: an opening animator, a dismissing animator, and an interaction controller for the dismissal.

**Opening.** The detail view controller enters the container and lays out synchronously. The existing `mediaViewportTransition` geometry maps `mediaViewport`'s transform onto the source cell's rect; the animation runs it back to identity with the current 0.42 s spring. Backdrop fades 0 → 1 over 0.24 s; chrome fades in over the final 0.16 s. All of this is the current choreography, unchanged — only its host changes.

**The source cell.** Hidden (`isHidden = true`) for the duration of the transition, restored on completion or cancellation. That single line replaces both the placeholder slot painted onto a snapshot (row 23) and the presenter handoff that kept a frozen bitmap above the hierarchy until the live presenter stabilized (row 27). Because the presenter is live, the masonry keeps its scroll position and in-flight thumbnail loads across the transition.

**Interactive dismissal.** `PhotoTransitionInteraction` drives one `UIPercentDrivenInteractiveTransition` from either the outer one-finger dismiss pan or a non-cancelling pinch tracker that recognizes simultaneously with the current viewer cell's `UIScrollView` pinch. Pan is accepted at every zoom scale. `UIScrollView` owns visual zoom until the tracker's independent cumulative scale crosses below fit, then the same touch sequence hands off continuously to the outer transition. Pan uses progress > 0.45 of 340 pt, or downward velocity > 1200 pt/s with at least 100 pt travelled; pinch uses scale/centroid progress > 0.45, or sufficient inward momentum. The dismissing animator flies the current photo geometry into the **live** source cell. See the 2026-08-11 gesture amendment in `2026-08-02-photo-dismiss-gesture-design.md`.

The real gain beyond deletion: the transition becomes genuinely interruptible. The hand-rolled implementation cannot be interrupted mid-flight; a percent-driven one can.

**Off-screen source.** If the pager moved to a photo whose cell is not laid out, fall back to drifting out along the gesture while fading, exactly as today.

## Deletions

`PhotoTransitionRegistry.swift` in full. `PhotoPresenterSnapshotView` with `coverLandingSlot` and `beginPresenterHandoff`. `findScreen()`, `disableCloseTransition()`, `configureRouteTransition()`, `presenterScreenView()`, `pushScreenTraits()`. `openingFallbackWorkItem` and the registry's 2 s cleanup. `isOpeningPhoto` and the JavaScript `openingRef` debounce. The `transitionId` prop and its `hasReceivedTransitionID` gate, end to end. The `RNScreens` podspec dependency.

Roughly 300 lines of Swift, plus the prop plumbing on both sides of the bridge.

## Testing

**Geometry as a pure function.** Extract the source-rect ↔ fullscreen aspect-fit mapping and cover it in `PhotoTransitionGeometryTests`, following the existing `PhotoDetailReactionGeometryTests` precedent. Portrait, landscape, square, and extreme aspect ratios; source cell partially off-screen; zero-size source.

**Interruption cases**, which is where custom interactive transitions actually break:

- Start the dismiss gesture while the opening animation is still running
- Cancel a dismissal and immediately begin another
- Switch tabs mid-transition
- Rotate mid-transition
- Trigger dismissal while a Live Photo is playing

**Reduce Motion.** The apply-final-values-directly path must survive the rewrite; it is easy to lose when the animation moves into an animator object.

**Before/after capture.** Record the opening and the drag dismissal with `gif_creator` on the pre-migration build, then compare frame by frame after. The visual result is supposed to be identical; this is the check that it is.

## Risk register

| Risk | Mitigation |
|---|---|
| Interruptible transitions are subtle and easy to get wrong | The five interruption cases above, exercised explicitly on the simulator |
| Status bar or home indicator regressing when traits move off `RNSScreenView` | `modalPresentationCapturesStatusBarAppearance`, verified in both orientations and with Live Photo playback |
| Visual drift during the rewrite | Frame-by-frame GIF comparison against the pre-migration build |
| Child VC containment done partially (missing `didMove`, or view-controller-level appearance callbacks not forwarded) | Containment is boilerplate but order-sensitive; assert appearance callbacks fire in a simulator pass |
| Reduce Motion path lost | Explicit case in the simulator pass, not just code review |

## Expected outcome

| | Before | After |
|---|---|---|
| Tap → opening animation | 69.8 ms | one main-thread call; no snapshot, no timers |
| Presenter during transition | Frozen window bitmap | Live view controller |
| Dismiss interruptible | No | Yes |
| Swift references to RNScreens | 7 call sites | None |
| Transition machinery | ~300 lines of defence | Two animators and an interaction controller |
