import { VIEWER_TRANSITION_TRIGGER_ATTRIBUTE } from './contracts'
import { escapeAttributeValue } from './frame-utils'
import type { ViewerTransitionItem } from './types'

interface ResolveViewerTransitionTriggerElementParams<TItem extends ViewerTransitionItem> {
  cachedTriggerElement?: HTMLElement | null
  currentItem?: TItem
  triggerAttribute?: string
  triggerElement?: HTMLElement | null
}

const isConnectedMatchingTriggerElement = <TItem extends ViewerTransitionItem>({
  currentItem,
  element,
  triggerAttribute,
}: {
  currentItem?: TItem
  element: HTMLElement | null | undefined
  triggerAttribute: string
}) => {
  if (!currentItem || !element || !element.isConnected) {
    return false
  }

  return element.getAttribute(triggerAttribute) === currentItem.id
}

export const resolveViewerTransitionTriggerElement = <TItem extends ViewerTransitionItem>({
  cachedTriggerElement = null,
  currentItem,
  triggerAttribute = VIEWER_TRANSITION_TRIGGER_ATTRIBUTE,
  triggerElement = null,
}: ResolveViewerTransitionTriggerElementParams<TItem>): HTMLElement | null => {
  if (
    isConnectedMatchingTriggerElement({
      currentItem,
      element: triggerElement,
      triggerAttribute,
    })
  ) {
    return triggerElement
  }

  if (currentItem && typeof document !== 'undefined') {
    const selector = `[${triggerAttribute}="${escapeAttributeValue(currentItem.id)}"]`
    const liveTriggerElement = document.querySelector<HTMLElement>(selector)

    if (
      isConnectedMatchingTriggerElement({
        currentItem,
        element: liveTriggerElement,
        triggerAttribute,
      })
    ) {
      return liveTriggerElement
    }
  }

  if (
    isConnectedMatchingTriggerElement({
      currentItem,
      element: cachedTriggerElement,
      triggerAttribute,
    })
  ) {
    return cachedTriggerElement
  }

  return null
}
