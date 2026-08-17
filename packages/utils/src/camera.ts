/**
 * 相机 / 镜头显示名的统一规则。
 *
 * 由 `packages/builder` 的机型、镜头集合（筛选器数据源）和 `apps/web` 的照片信息面板共用，
 * 避免两边各写一套导致筛选项和面板显示不一致。
 */

export interface LensExifFields {
  LensMake?: string
  LensModel?: string
  LensType?: string
}

/** MakerNotes 里常见的占位值，不能当作真实镜头名 */
const isPlaceholderLens = (value: string) => /^(?:unknown|n\/a|none)\b/i.test(value)

/**
 * 相机显示名。Model 已经带上厂商名时不再重复拼接 Make，
 * 例如 "RICOH IMAGING COMPANY, LTD." + "RICOH GR IV" 只保留 "RICOH GR IV"。
 */
export const formatCameraDisplayName = (make?: string, model?: string): string | null => {
  const trimmedMake = make?.trim()
  const trimmedModel = model?.trim()
  if (!trimmedMake || !trimmedModel) {
    return null
  }

  const brand = trimmedMake.split(/[\s,]+/)[0]
  if (brand && trimmedModel.toLowerCase().startsWith(brand.toLowerCase())) {
    return trimmedModel
  }
  return `${trimmedMake} ${trimmedModel}`
}

/**
 * 镜头型号。理光 GR 这类定焦机身不写 LensModel，
 * 退回 MakerNotes 的 LensType（如 "18.3mm F2.8"）。
 */
export const resolveLensModel = (exif: LensExifFields): string | null => {
  const lensModel = exif.LensModel?.trim()
  if (lensModel) {
    return lensModel
  }

  const lensType = exif.LensType?.trim()
  if (lensType && !isPlaceholderLens(lensType)) {
    return lensType
  }

  return null
}

/** 镜头显示名，有厂商信息则带上 */
export const formatLensDisplayName = (exif: LensExifFields): string | null => {
  const model = resolveLensModel(exif)
  if (!model) {
    return null
  }

  const make = exif.LensMake?.trim()
  return make ? `${make} ${model}` : model
}
