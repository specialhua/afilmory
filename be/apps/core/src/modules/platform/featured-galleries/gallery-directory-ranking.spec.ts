import { describe, expect, it } from 'vitest'

import { galleryDirectoryMatchRank } from './gallery-directory-ranking'

describe('gallery directory ranking', () => {
  it('prioritizes exact handles, then prefixes, then public-field substrings', () => {
    expect(galleryDirectoryMatchRank('street', ['Street', 'street-photo', 'Alice'])).toBe(0)
    expect(galleryDirectoryMatchRank('street', ['Street Journal', 'journal', 'Alice'])).toBe(1)
    expect(galleryDirectoryMatchRank('street', ['Night Street Journal', 'journal', 'Alice'])).toBe(2)
  })

  it('normalizes case and diacritics in public display values', () => {
    expect(galleryDirectoryMatchRank('cafe', ['Café Archive'])).toBe(1)
  })

  it('does not match values outside the explicitly supplied public fields', () => {
    expect(galleryDirectoryMatchRank('private@example.com', ['Public Gallery', 'public-gallery', 'Alice'])).toBe(
      Number.MAX_SAFE_INTEGER,
    )
  })
})
