# @afilmory/viewer-motion

Reusable motion primitives for fullscreen media viewers in React.

This package gives you the animation and gesture building blocks behind a modern image viewer, without owning your data model, routing, media loader, or UI chrome.

It is a good fit when you already have:

- a grid or list of thumbnails
- a fullscreen viewer or lightbox
- React state that decides which item is open

And you want to add:

- shared-element entry and exit transitions between the trigger thumbnail and the viewer stage
- mobile drag-to-dismiss projection
- mobile inspector-sheet gestures
- geometry helpers for mapping the viewer back into a thumbnail frame

## What This Package Does

- Finds the trigger element for the active item by `item.id`
- Computes the fullscreen media frame inside your viewer stage
- Produces entry and exit transition state for a temporary preview overlay
- Projects mobile dismiss gestures back into a closing shared-element frame
- Exposes motion values for mobile viewer interactions

## What Stays in Your App

This package intentionally does not own:

- routing and history timing
- the open/close state of your viewer
- image loading, preloading, or progressive rendering
- toolbars, share buttons, side panels, metadata panels, thumbnail strips
- placeholder rendering details
- backdrop visuals

That split is deliberate. The host app owns product decisions. `@afilmory/viewer-motion` only handles motion and geometry.

## Getting the Package Into Another App

Inside Afilmory this package is consumed as a workspace package.

If you want to use it in another React codebase, the practical options are:

1. Add `packages/viewer-motion` to your own monorepo/workspace.
2. Vendor it into your codebase and keep the public API intact.
3. Publish it under your own registry scope and consume it like a normal package.

If you choose option 3, build the distributable files first:

```bash
pnpm --filter @afilmory/viewer-motion build
```

The package expects:

- `react`
- `react-dom`

And it depends on:

- `motion`
- `@use-gesture/react`

## Mental Model

There are 3 moving pieces:

1. A trigger element in your list or grid.
2. A viewer stage that knows where the fullscreen media should end up.
3. A temporary preview overlay that animates between the two.

The usual lifecycle looks like this:

1. User clicks a thumbnail.
2. Your app stores both the selected item and the clicked `HTMLElement`.
3. `useViewerTransitions()` creates an entry transition from the trigger rect to the viewer rect.
4. `SharedElementTransitionPreview` renders the moving overlay.
5. Your real viewer content fades or hands off underneath it.
6. When closing, the same hook finds the live trigger again and animates back.

If the hook cannot find a valid trigger element, it degrades gracefully:

- no entry animation: the viewer content becomes visible immediately
- no exit animation: `onExitComplete` is called immediately

## Trigger Contract

By default the hook looks up triggers with:

```html
data-viewer-transition-id="<item.id>"
```

Use `getViewerTransitionTriggerProps(item.id)` on the clickable thumbnail shell:

```tsx
import { getViewerTransitionTriggerProps } from '@afilmory/viewer-motion'

<button
  type="button"
  {...getViewerTransitionTriggerProps(item.id)}
  onClick={(event) => openViewer(item, event.currentTarget)}
>
  <img src={item.previewSrc} alt={item.title} />
</button>
```

You can replace the attribute name with `triggerAttribute` if your app already has a different contract.

## Quick Start

The snippet below shows the minimal wiring for a generic React lightbox.

```tsx
import { useState } from 'react'
import {
  getViewerTransitionTriggerProps,
  SharedElementTransitionPreview,
  useViewerTransitions,
} from '@afilmory/viewer-motion'

type MediaItem = {
  id: string
  title: string
  width: number
  height: number
  previewSrc: string
  fullSrc: string
}

const VIEWER_LAYOUT = {
  desktopSidebarWidthRem: 18,
  desktopThumbnailStripHeight: 72,
  mobileThumbnailStripHeight: 56,
} as const

export function Gallery({ items }: { items: MediaItem[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentItem, setCurrentItem] = useState<MediaItem | undefined>()
  const [triggerElement, setTriggerElement] = useState<HTMLElement | null>(null)

  const isMobile = useIsMobile() // Implement this in your app.

  const {
    containerRef,
    entryTransition,
    exitTransition,
    hasTransitionTrigger,
    isViewerContentVisible,
    shouldRenderBackdrop,
    handleEntryTransitionReady,
    handleEntryTransitionComplete,
    handleExitAnimationComplete,
  } = useViewerTransitions({
    currentItem,
    isMobile,
    isOpen,
    layout: VIEWER_LAYOUT,
    onExitComplete: () => {
      setCurrentItem(undefined)
      setTriggerElement(null)
    },
    triggerElement,
  })

  const openViewer = (item: MediaItem, element: HTMLElement) => {
    setCurrentItem(item)
    setTriggerElement(element)
    setIsOpen(true)
  }

  const closeViewer = () => {
    setIsOpen(false)
  }

  const shouldMountStage = isOpen && (isViewerContentVisible || !hasTransitionTrigger)

  return (
    <>
      <div className="grid">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            {...getViewerTransitionTriggerProps(item.id)}
            onClick={(event) => openViewer(item, event.currentTarget)}
          >
            <img src={item.previewSrc} alt={item.title} />
          </button>
        ))}
      </div>

      {shouldRenderBackdrop && <div className="viewer-backdrop" />}

      {isOpen && currentItem && (
        <div
          ref={containerRef}
          className="viewer-shell"
          style={{
            pointerEvents: isViewerContentVisible ? 'auto' : 'none',
          }}
        >
          <button type="button" onClick={closeViewer}>
            Close
          </button>

          {shouldMountStage ? (
            <div
              className="viewer-stage"
              style={{
                opacity: isViewerContentVisible ? 1 : 0,
                transition: 'opacity 150ms ease',
              }}
            >
              <img
                src={currentItem.fullSrc}
                alt={currentItem.title}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          ) : null}
        </div>
      )}

      {entryTransition && (
        <SharedElementTransitionPreview
          transition={entryTransition}
          onReady={handleEntryTransitionReady}
          onComplete={handleEntryTransitionComplete}
        />
      )}

      {exitTransition && (
        <SharedElementTransitionPreview
          transition={exitTransition}
          onComplete={handleExitAnimationComplete}
        />
      )}
    </>
  )
}
```

### Why `handleEntryTransitionReady` Exists

The preview overlay should not always wait for the entire geometry animation to finish before your real viewer content appears.

`handleEntryTransitionReady()` gives you a handoff point:

- call it from `SharedElementTransitionPreview.onReady`
- use `isViewerContentVisible` to fade or reveal the real viewer content underneath
- keep `handleEntryTransitionComplete()` connected so the temporary overlay unmounts when the transition finishes

This makes entry animations feel faster and avoids a dead pause between click and viewer response.

## Viewer Layout and Geometry

By default, frame calculations assume the fullscreen media can use the entire viewport.

That is the generic default:

```ts
import { DEFAULT_VIEWER_FRAME_LAYOUT } from '@afilmory/viewer-motion'

// {
//   desktopSidebarWidthRem: 0,
//   desktopThumbnailStripHeight: 0,
//   mobileThumbnailStripHeight: 0,
// }
```

If your viewer reserves space for chrome, pass a `layout` object to `useViewerTransitions()` and `projectDismissedViewerMediaFrame()`:

```ts
const layout = {
  desktopSidebarWidthRem: 20,
  desktopThumbnailStripHeight: 64,
  mobileThumbnailStripHeight: 48,
}
```

That keeps:

- entry transition target frames
- exit transition source frames
- drag-to-dismiss projection

all aligned with the actual stage where your media is rendered.

## Mobile Interactions

`useViewerMobileInteractions()` gives you the gesture state for a mobile-first viewer shell.

It covers two behaviors:

- drag down to dismiss
- drag up to reveal an inspector sheet

Example:

```tsx
import {
  DEFAULT_MOBILE_VIEWER_MEDIA_TRANSFORM_ORIGIN,
  projectDismissedViewerMediaFrame,
  useViewerMobileInteractions,
} from '@afilmory/viewer-motion'

const { bindStage, dismissX, viewerLiftY, viewerScale, viewerRotate, viewerBorderRadius } =
  useViewerMobileInteractions({
    enabled: isMobile && isOpen,
    isImageZoomed,
    onDismiss: (snapshot) => {
      const projectedFrame = projectDismissedViewerMediaFrame({
        item: currentItem,
        isMobile: true,
        layout,
        snapshot,
        viewportRect: containerRef.current?.getBoundingClientRect() ?? null,
      })

      setExitOverrideFrame(projectedFrame)
      setIsOpen(false)
    },
  })

<motion.div
  {...bindStage()}
  style={{
    x: dismissX,
    y: viewerLiftY,
    scale: viewerScale,
    rotate: viewerRotate,
    borderRadius: viewerBorderRadius,
    transformOrigin: DEFAULT_MOBILE_VIEWER_MEDIA_TRANSFORM_ORIGIN,
  }}
/>
```

### Important

The mobile dismiss projection assumes the same transform origin is used by both:

- the viewer shell you animate during the gesture
- the frame projection utilities

Use `DEFAULT_MOBILE_VIEWER_MEDIA_TRANSFORM_ORIGIN` instead of hardcoding this in multiple places.

## Placeholder Rendering

`SharedElementTransitionPreview` can render a placeholder underneath the transition image.

That is useful when:

- you have a BlurHash or ThumbHash
- your high-resolution viewer content mounts slightly later
- you want to avoid a flash when the preview source changes

```tsx
<SharedElementTransitionPreview
  transition={entryTransition}
  onReady={handleEntryTransitionReady}
  onComplete={handleEntryTransitionComplete}
  renderPlaceholder={(thumbHash) => (
    <MyHashPlaceholder thumbHash={thumbHash} />
  )}
/>
```

## API Overview

### `getViewerTransitionTriggerProps(itemId)`

Returns the default data attribute used by trigger lookup.

Use it on the clickable list/grid item that opens the viewer.

### `useViewerTransitions(options)`

The central hook for entry and exit shared-element transitions.

Key inputs:

- `currentItem`: the active media item
- `isOpen`: whether the viewer is currently open
- `isMobile`: your app's mobile breakpoint decision
- `triggerElement`: the element used to open the viewer
- `layout`: optional viewport chrome offsets
- `currentDisplaySrc`: optional source currently shown by the viewer
- `exitOverrideFrame`: optional projected frame, usually from drag-to-dismiss

Key outputs:

- `containerRef`: attach this to the viewer shell
- `entryTransition` / `exitTransition`: pass into `SharedElementTransitionPreview`
- `hasTransitionTrigger`: whether the current item has a live transition source, either from the clicked element or trigger recovery
- `isViewerContentVisible`: handoff signal for your real content
- `shouldRenderBackdrop`: useful for backdrop and placeholder layers
- `handleEntryTransitionReady`
- `handleEntryTransitionComplete`
- `handleExitAnimationComplete`

### `SharedElementTransitionPreview`

The temporary overlay that animates between the trigger frame and the fullscreen frame.

Render it only while `entryTransition` or `exitTransition` is non-null.

### `useViewerMobileInteractions(options)`

Provides motion values and gesture binders for:

- inspector reveal
- dismiss drag
- viewer shell presentation
- chrome and backdrop presentation

### Geometry Helpers

- `computeViewerMediaFrame()`
- `projectViewerMediaFrame()`
- `projectDismissedViewerMediaFrame()`

Use these when your viewer shell itself is animated and you need to map that presentation back into a shared-element exit frame.

## Common Integration Mistakes

### 1. Not storing the clicked `HTMLElement`

The hook can recover the live trigger later, but the best opening animation comes from passing the actual clicked element on open.

### 2. Using a different `item.id` between list and viewer

Exit lookup depends on a stable identifier. If your route slug differs from the list id, pass the same transition id through both.

### 3. Forgetting to pass `layout`

If your viewer does not use the full viewport, the transition target frame will feel "off" unless the hook knows about your reserved chrome.

### 4. Rendering the real viewer content too early

Use `hasTransitionTrigger` together with `isViewerContentVisible` to avoid mounting the heavyweight viewer stage underneath an active shared-element entry.

If you skip this and only check whether `triggerElement` is non-null, history-driven opens can recover a trigger internally while your real viewer is already visible, which produces a duplicate fullscreen image during the entry handoff.

### 5. Closing before the list/grid thumbnail is live again

Exit animations need a live trigger element. If your list route unmounts first, the hook will skip the exit animation and complete immediately.

## SSR and Client Rendering

The hooks are DOM-dependent. Use them only in client-rendered React components.

On the server they intentionally do nothing useful, because the package needs real element bounds and viewport dimensions.

## Development Notes

Inside Afilmory this package is consumed directly from source within the monorepo.

The public API is intentionally generic enough to vendor or publish for other React apps, but the package still expects the host app to make the product-level decisions around media loading, routing, and viewer UI composition.
