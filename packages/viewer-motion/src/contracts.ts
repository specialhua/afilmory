export const VIEWER_TRANSITION_TRIGGER_ATTRIBUTE = 'data-viewer-transition-id'

export const getViewerTransitionTriggerProps = (itemId: string) => ({
  [VIEWER_TRANSITION_TRIGGER_ATTRIBUTE]: itemId,
})
