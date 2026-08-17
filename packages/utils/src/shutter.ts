/**
 * 快门速度的统一显示规则。
 *
 * 由照片信息面板、瀑布流/列表卡片、SSR 分享页、RSS 和 OG 图共用。
 */

/** 分数式与秒式的分界：1/8 秒及更快用分数，更慢的长曝光用秒 */
const FRACTION_THRESHOLD_SECONDS = 1 / 8

/**
 * 把 EXIF 里的曝光时间解析成秒。
 * exiftool 可能给出数字（0.6）或字符串（"1/200"、"0.6"、"1/200s"）。
 */
const parseExposureSeconds = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const normalized = value.trim().replace(/s$/i, '').trim()

  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(normalized)
  if (fraction) {
    const denominator = Number.parseFloat(fraction[2])
    if (!denominator) {
      return null
    }
    return Number.parseFloat(fraction[1]) / denominator
  }

  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 格式化快门速度。
 *
 * - 1/8 秒及更快：分数式，如 `1/200s`、`1/8s`
 * - 慢于 1/8 秒：秒式，最多两位小数并去掉多余的 0，如 `0.6s`、`2.5s`、`30s`
 *
 * 旧逻辑对长曝光会算出 `1/${Math.round(1 / 0.6)}` = `1/2s`，既不准确（0.5 ≠ 0.6）
 * 又把长曝光写成了高速快门的样子。
 */
export const formatShutterSpeed = (value: string | number | null | undefined): string | null => {
  const seconds = parseExposureSeconds(value)
  if (seconds === null || seconds <= 0) {
    return null
  }

  if (seconds <= FRACTION_THRESHOLD_SECONDS) {
    return `1/${Math.round(1 / seconds)}s`
  }

  return `${Number(seconds.toFixed(2))}s`
}
