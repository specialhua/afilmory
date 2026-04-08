import { injectConfig, siteConfig } from '~/config'
import { commentsApi } from '~/lib/api/comments'

import { fetchWalineCommentCount, getWalineServerURL } from './waline'

export const hasCommentPanel = injectConfig.useCloud || siteConfig.comments?.provider === 'waline'

export const canFetchPhotoCommentCount =
  injectConfig.useCloud || (siteConfig.comments?.provider === 'waline' && !!getWalineServerURL())

export const getPhotoCommentCount = async (photoId: string): Promise<{ count: number }> => {
  if (siteConfig.comments?.provider === 'waline') {
    return fetchWalineCommentCount(photoId)
  }

  if (injectConfig.useCloud) {
    return commentsApi.count(photoId)
  }

  return { count: 0 }
}
