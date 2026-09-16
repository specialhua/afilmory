import type { PhotoRegion } from '@afilmory/builder'
import { clsxm } from '@afilmory/utils'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { PhotoRegionBounds } from './photo-region-bounds'
import { getFloatingLabelPosition, getPhotoRegionBounds } from './photo-region-bounds'
import { getPhotoRegionIcon, getPhotoRegionId } from './photo-region-display'

interface PhotoRegionsOverlayProps {
  regions: PhotoRegion[]
  photoWidth?: number
  photoHeight?: number
  orientation?: number
  accentColor?: string
  labelPlacement?: 'edge' | 'floating'
  activeRegionId?: string | null
  showAllBoxes?: boolean
  interactive?: boolean
  onActiveRegionChange?: (regionId: string | null) => void
}

interface RegionViewModel {
  id: string
  name: string
  type: string | undefined
  bounds: PhotoRegionBounds
}

export const PhotoRegionsOverlay = ({
  regions,
  photoWidth,
  photoHeight,
  orientation,
  accentColor,
  labelPlacement = 'edge',
  activeRegionId,
  showAllBoxes = false,
  interactive = true,
  onActiveRegionChange,
}: PhotoRegionsOverlayProps) => {
  const [localActiveRegionId, setLocalActiveRegionId] = useState<string | null>(null)
  const [overlayHeight, setOverlayHeight] = useState(0)
  const overlayRef = useRef<HTMLDivElement>(null)
  const resolvedActiveRegionId = activeRegionId === undefined ? localActiveRegionId : activeRegionId

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) {
      return
    }

    const observer = new ResizeObserver(entries => setOverlayHeight(entries[0]?.contentRect.height ?? 0))
    observer.observe(overlay)
    return () => observer.disconnect()
  }, [])

  const setActiveRegion = (regionId: string | null) => {
    if (activeRegionId === undefined) {
      setLocalActiveRegionId(regionId)
    }
    onActiveRegionChange?.(regionId)
  }

  const clearActiveRegion = (regionId: string) => {
    if (activeRegionId === undefined) {
      setLocalActiveRegionId(current => (current === regionId ? null : current))
      return
    }

    if (activeRegionId === regionId) {
      onActiveRegionChange?.(null)
    }
  }

  const regionViews = useMemo<RegionViewModel[]>(() => {
    return regions
      .map((region, index) => {
        const bounds = getPhotoRegionBounds(region, photoWidth, photoHeight, orientation)
        if (!bounds) {
          return null
        }

        return {
          id: getPhotoRegionId(region, index),
          name: region.name,
          type: region.type,
          bounds,
        }
      })
      .filter((region): region is RegionViewModel => region !== null)
  }, [orientation, photoHeight, photoWidth, regions])

  if (regionViews.length === 0) {
    return null
  }

  const hasActiveRegion = resolvedActiveRegionId !== null
  const accentStyle = accentColor ? ({ '--color-accent': accentColor } as CSSProperties) : undefined

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-20" style={accentStyle}>
      {regionViews.map((region) => {
        const isActive = resolvedActiveRegionId === region.id
        const isMuted = showAllBoxes && hasActiveRegion && !isActive
        const showBox = showAllBoxes || isActive
        const showLabel = showAllBoxes || isActive
        const primaryLabel = region.name || region.type
        const secondaryLabel = region.name ? region.type : undefined
        const isFloatingLabelBelow
          = labelPlacement === 'floating' && getFloatingLabelPosition(region.bounds.top, overlayHeight) === 'below'

        return (
          <div
            key={region.id}
            className={clsxm('absolute', interactive && 'pointer-events-auto')}
            data-photo-region-hit-area={interactive ? '' : undefined}
            data-photo-region-active={isActive ? '' : undefined}
            style={{
              left: `${region.bounds.left * 100}%`,
              top: `${region.bounds.top * 100}%`,
              width: `${region.bounds.width * 100}%`,
              height: `${region.bounds.height * 100}%`,
            }}
            onPointerEnter={interactive ? () => setActiveRegion(region.id) : undefined}
            onPointerLeave={interactive ? () => clearActiveRegion(region.id) : undefined}
          >
            <div
              className={clsxm(
                'pointer-events-none absolute inset-0 transition-opacity duration-200 ease-out',
                showBox ? (isMuted ? 'opacity-35' : isActive ? 'opacity-100' : 'opacity-80') : 'opacity-0',
              )}
            >
              <div
                className={clsxm(
                  'absolute inset-0 border transition-colors duration-200',
                  isActive ? 'border-accent/45' : 'border-black/70',
                )}
              />
              <div
                className={clsxm(
                  'absolute inset-px border transition-colors duration-200',
                  isActive ? 'border-accent' : 'border-white/80',
                )}
              />
            </div>

            {primaryLabel && (
              <div
                className={clsxm(
                  'pointer-events-none absolute z-30 max-w-[min(22rem,80vw)] transition-opacity duration-200',
                  labelPlacement === 'floating'
                    ? isFloatingLabelBelow
                      ? 'top-full left-1/2 -translate-x-1/2 translate-y-1.5'
                      : 'top-0 left-1/2 -translate-x-1/2 -translate-y-[calc(100%+0.375rem)]'
                    : 'top-0 left-0 -translate-y-1/2',
                  showLabel ? (isMuted ? 'opacity-45' : 'opacity-100') : 'opacity-0',
                )}
              >
                <div className="bg-material-ultra-thick shadow-context-menu flex h-7 max-w-full items-center gap-1.5 rounded-full border border-white/15 px-2.5 text-xs text-white backdrop-blur-2xl">
                  <i
                    className={clsxm(getPhotoRegionIcon(region.type), 'size-4 shrink-0 text-white/90')}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate font-medium text-white/95">{primaryLabel}</span>
                  {secondaryLabel && <span className="shrink-0 text-white/55">{secondaryLabel}</span>}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
