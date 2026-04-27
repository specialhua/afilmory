import assert from 'node:assert/strict'
import test from 'node:test'

import * as mobileInteractionUtils from './mobile-interaction-utils'

const { createDismissPresentationSnapshot } = mobileInteractionUtils

test('createDismissPresentationSnapshot matches the mobile dismiss projection used by the viewer shell', () => {
  const snapshot = createDismissPresentationSnapshot({
    translateX: 50,
    translateY: 200,
    dismissTravel: 900,
    viewportWidth: 390,
  })

  assert.equal(snapshot.translateX, 50)
  assert.equal(snapshot.translateY, 200)
  assert.equal(Number(snapshot.scale.toFixed(4)), 0.9486)
  assert.equal(Number(snapshot.rotate.toFixed(4)), 0.7035)
  assert.equal(Number(snapshot.borderRadius.toFixed(4)), 8.6914)
})

test('resolveInspectorSheetHeight clamps the mobile sheet to a reusable viewport-aware height', () => {
  assert.equal(typeof mobileInteractionUtils.resolveInspectorSheetHeight, 'function')

  assert.equal(mobileInteractionUtils.resolveInspectorSheetHeight(500), 360)
  assert.equal(Number(mobileInteractionUtils.resolveInspectorSheetHeight(844).toFixed(2)), 573.92)
  assert.equal(Number(mobileInteractionUtils.resolveInspectorSheetHeight(1200).toFixed(0)), 816)
})

test('createInspectorSheetPresentation derives y opacity and scale from progress', () => {
  assert.equal(typeof mobileInteractionUtils.createInspectorSheetPresentation, 'function')

  const presentation = mobileInteractionUtils.createInspectorSheetPresentation({
    progress: 0.5,
    sheetHeight: 573.92,
  })

  assert.equal(Number(presentation.y.toFixed(4)), 75.24)
  assert.equal(Number(presentation.opacity.toFixed(4)), 0.8)
  assert.equal(Number(presentation.scale.toFixed(4)), 0.9956)
})
