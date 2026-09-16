export const resolvePhotoMarkerCardBehavior = ({ isSelected }: { isSelected: boolean }) => ({
  hoverCardCloseDelay: 100,
  hoverCardOpen: undefined,
  hoverCardOpenDelay: 400,
  renderAnchoredCard: isSelected,
})
