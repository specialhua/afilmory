export function buildProtectedMediaUrl(baseUrl: string, kind: 'original' | 'live', photoId: string): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  return `${normalized}/${kind}/${encodeURIComponent(photoId)}`
}
