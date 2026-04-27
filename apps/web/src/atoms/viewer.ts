import { atom } from 'jotai'

import { jotaiStore } from '~/lib/jotai'

// Source of truth for viewer state, synced with URL
export interface ViewerState {
  isOpen: boolean
  openInstanceId: number
  pendingCloseInstanceId: number | null
  photoId: string | null
  // Internal state not synced with URL
  triggerElement: HTMLElement | null
}

export const viewerAtom = atom<ViewerState>({
  isOpen: false,
  openInstanceId: 0,
  pendingCloseInstanceId: null,
  photoId: null,
  triggerElement: null,
})

// Helper to get viewer state from store
export const getViewer = () => jotaiStore.get(viewerAtom)

// Helper to set viewer state - supports both direct value and updater function
export const setViewer = (valueOrUpdater: ViewerState | ((prev: ViewerState) => ViewerState)) => {
  if (typeof valueOrUpdater === 'function') {
    const prev = jotaiStore.get(viewerAtom)
    jotaiStore.set(viewerAtom, valueOrUpdater(prev))
  } else {
    jotaiStore.set(viewerAtom, valueOrUpdater)
  }
}
