import assert from 'node:assert/strict'
import test from 'node:test'

import * as frameUtils from './frame-utils'

const { computeViewerMediaFrame, projectViewerMediaFrame } = frameUtils

test('computeViewerMediaFrame fits landscape media inside the full viewport by default', () => {
  const frame = computeViewerMediaFrame(
    { width: 4000, height: 3000 },
    { left: 10, top: 20, width: 1000, height: 800 },
    false,
  )

  assert.deepEqual(frame, {
    left: 10,
    top: 45,
    width: 1000,
    height: 750,
    borderRadius: 0,
    rotate: 0,
    transformOrigin: '50% 50%',
  })
})

test('computeViewerMediaFrame fits portrait media inside the available height', () => {
  const frame = computeViewerMediaFrame(
    { width: 3000, height: 4000 },
    { left: 0, top: 0, width: 1000, height: 800 },
    false,
  )

  assert.deepEqual(frame, {
    left: 200,
    top: 0,
    width: 600,
    height: 800,
    borderRadius: 0,
    rotate: 0,
    transformOrigin: '50% 50%',
  })
})

test('computeViewerMediaFrame accepts explicit host chrome layout when the viewer does not occupy the full viewport', () => {
  const frame = computeViewerMediaFrame(
    { width: 4000, height: 3000 },
    { left: 10, top: 20, width: 1000, height: 800 },
    false,
    {
      desktopSidebarWidthRem: 20,
      desktopThumbnailStripHeight: 64,
    },
  )

  assert.deepEqual(frame, {
    left: 10,
    top: 133,
    width: 680,
    height: 510,
    borderRadius: 0,
    rotate: 0,
    transformOrigin: '50% 50%',
  })
})

test('computeViewerMediaFrame keeps the mobile viewer transform origin aligned with the dismiss gesture anchor', () => {
  const frame = computeViewerMediaFrame(
    { width: 3000, height: 4000 },
    { left: 0, top: 0, width: 390, height: 844 },
    true,
  )

  assert.equal(frame.transformOrigin, '50% 18%')
})

test('projectViewerMediaFrame applies scale, translation, radius, and rotation around the mobile origin', () => {
  const frame = projectViewerMediaFrame(
    {
      left: 100,
      top: 120,
      width: 300,
      height: 200,
      borderRadius: 0,
      rotate: 0,
      transformOrigin: '50% 18%',
    },
    { left: 0, top: 0, width: 1000, height: 800 },
    {
      scale: 0.9,
      translateX: 40,
      translateY: 80,
      borderRadius: 14,
      rotate: 3,
    },
  )

  assert.equal(frame.left, 180)
  assert.equal(frame.top, 202.4)
  assert.equal(frame.width, 270)
  assert.equal(frame.height, 180)
  assert.equal(frame.borderRadius, 14)
  assert.equal(frame.rotate, 3)
  assert.equal(frame.transformOrigin, '50% 18%')
})

test('projectDismissedViewerMediaFrame combines the default viewer frame calculation with the dismiss snapshot projection', () => {
  assert.equal(typeof frameUtils.projectDismissedViewerMediaFrame, 'function')

  const frame = frameUtils.projectDismissedViewerMediaFrame({
    item: { width: 3000, height: 4000 },
    viewportRect: { left: 0, top: 0, width: 1000, height: 800 },
    snapshot: {
      scale: 0.9,
      translateX: 40,
      translateY: 80,
      borderRadius: 14,
      rotate: 3,
    },
    isMobile: true,
  })

  assert.equal(frame.left, 270)
  assert.equal(frame.top, 94.4)
  assert.equal(frame.width, 540)
  assert.equal(Number(frame.height.toFixed(1)), 720)
  assert.equal(frame.borderRadius, 14)
  assert.equal(frame.rotate, 3)
  assert.equal(frame.transformOrigin, '50% 18%')
})
