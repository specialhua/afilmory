export function galleryPushBody(locale: string | null, photoCount: number): string {
  const count = Math.max(1, Math.trunc(photoCount))
  const language = locale?.toLowerCase() ?? 'en'

  if (language.startsWith('zh')) {
    return `刚刚发布了 ${count} 张新照片。`
  }
  if (language.startsWith('ja')) {
    return `新しい写真を${count}枚公開しました。`
  }
  if (language.startsWith('ko')) {
    return `새 사진 ${count}장을 게시했습니다.`
  }
  return count === 1 ? 'Just published a new photo.' : `Just published ${count} new photos.`
}
