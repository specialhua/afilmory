const NO_MATCH_RANK = Number.MAX_SAFE_INTEGER
const DIACRITIC_PATTERN = /\p{Diacritic}/gu

function normalizeDirectoryValue(value: string) {
  return value.normalize('NFKD').replaceAll(DIACRITIC_PATTERN, '').toLocaleLowerCase().trim()
}

export function galleryDirectoryMatchRank(query: string, values: Array<string | null | undefined>): number {
  const normalizedQuery = normalizeDirectoryValue(query)
  if (!normalizedQuery)
    return 0

  const normalizedValues = values.filter((value): value is string => Boolean(value)).map(normalizeDirectoryValue)
  if (normalizedValues.includes(normalizedQuery))
    return 0
  if (normalizedValues.some(value => value.startsWith(normalizedQuery)))
    return 1
  if (normalizedValues.some(value => value.includes(normalizedQuery)))
    return 2
  return NO_MATCH_RANK
}
