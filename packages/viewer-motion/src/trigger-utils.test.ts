import assert from 'node:assert/strict'
import test from 'node:test'

import { VIEWER_TRANSITION_TRIGGER_ATTRIBUTE } from './contracts'
import { resolveViewerTransitionTriggerElement } from './trigger-utils'

const withMockDocument = async (documentValue: Pick<Document, 'querySelector'>, run: () => void | Promise<void>) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: documentValue,
    writable: true,
  })

  try {
    await run()
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, 'document', descriptor)
    } else {
      Reflect.deleteProperty(globalThis, 'document')
    }
  }
}

const createTriggerElement = (itemId: string, options?: { isConnected?: boolean }) => {
  const { isConnected = true } = options ?? {}

  return {
    getAttribute: (attribute: string) => (attribute === VIEWER_TRANSITION_TRIGGER_ATTRIBUTE ? itemId : null),
    isConnected,
  } as unknown as HTMLElement
}

test('resolveViewerTransitionTriggerElement prefers the explicit trigger when it still matches the current item', async () => {
  const directTrigger = createTriggerElement('photo-1')
  const cachedTrigger = createTriggerElement('photo-2')

  await withMockDocument(
    {
      querySelector: () => {
        throw new Error('document.querySelector should not run when the explicit trigger is usable')
      },
    },
    () => {
      const resolvedTrigger = resolveViewerTransitionTriggerElement({
        cachedTriggerElement: cachedTrigger,
        currentItem: { id: 'photo-1' },
        triggerElement: directTrigger,
      })

      assert.equal(resolvedTrigger, directTrigger)
    },
  )
})

test('resolveViewerTransitionTriggerElement recovers a live DOM trigger when the explicit trigger is missing', async () => {
  const liveTrigger = createTriggerElement('photo-7')
  let queriedSelector = ''

  await withMockDocument(
    {
      querySelector: (selector) => {
        queriedSelector = selector
        return liveTrigger
      },
    },
    () => {
      const resolvedTrigger = resolveViewerTransitionTriggerElement({
        currentItem: { id: 'photo-7' },
        triggerElement: null,
      })

      assert.equal(queriedSelector, `[${VIEWER_TRANSITION_TRIGGER_ATTRIBUTE}="photo-7"]`)
      assert.equal(resolvedTrigger, liveTrigger)
    },
  )
})

test('resolveViewerTransitionTriggerElement falls back to the cached trigger when the DOM no longer exposes a live match', async () => {
  const cachedTrigger = createTriggerElement('photo-9')

  await withMockDocument(
    {
      querySelector: () => null,
    },
    () => {
      const resolvedTrigger = resolveViewerTransitionTriggerElement({
        cachedTriggerElement: cachedTrigger,
        currentItem: { id: 'photo-9' },
        triggerElement: null,
      })

      assert.equal(resolvedTrigger, cachedTrigger)
    },
  )
})

test('resolveViewerTransitionTriggerElement ignores disconnected or mismatched triggers', async () => {
  const disconnectedTrigger = createTriggerElement('photo-11', { isConnected: false })
  const mismatchedLiveTrigger = createTriggerElement('photo-12')

  await withMockDocument(
    {
      querySelector: () => mismatchedLiveTrigger,
    },
    () => {
      const resolvedTrigger = resolveViewerTransitionTriggerElement({
        cachedTriggerElement: disconnectedTrigger,
        currentItem: { id: 'photo-11' },
        triggerElement: disconnectedTrigger,
      })

      assert.equal(resolvedTrigger, null)
    },
  )
})
