import type { PickedExif } from '@afilmory/builder'
import { MobileTabGroup, MobileTabItem } from '@afilmory/ui'
import { createInspectorSheetPresentation, resolveInspectorSheetHeight } from '@afilmory/viewer-motion'
import { useQuery } from '@tanstack/react-query'
import { useDrag } from '@use-gesture/react'
import type { MotionValue } from 'motion/react'
import { animate, m, useMotionValue, useTransform } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useViewport } from '~/hooks/useViewport'
import { useVisualViewport } from '~/hooks/useVisualViewport'
import { ExifPanelContent } from '~/modules/metadata/ExifPanel'
import { CommentsPanel } from '~/modules/social/comments'
import { canFetchPhotoCommentCount, getPhotoCommentCount, hasCommentPanel } from '~/modules/social/comments/count'
import type { PhotoManifest } from '~/types/photo'

type Tab = 'info' | 'comments'

const SHEET_HANDLE_CLOSE_DISTANCE = 72
const SHEET_HANDLE_MAX_DRAG = 120
/**
 * 小于该值的底部遮挡视为滚动回弹抖动，不做偏移。
 */
const MIN_BOTTOM_INSET = 24
/**
 * 键盘弹出时面板顶部留出的缝隙，露一点照片保持上下文。
 */
const KEYBOARD_SHEET_TOP_GAP = 12
const KEYBOARD_SHEET_MIN_HEIGHT = 220
/**
 * 等键盘动画和面板高度变化落定后再把输入框滚进可视区。
 */
const SCROLL_INTO_VIEW_DELAY = 320

const EDITABLE_SELECTOR = 'input, textarea, [contenteditable="true"]'

const isEditableElement = (node: EventTarget | null): node is HTMLElement =>
  node instanceof HTMLElement && node.matches(EDITABLE_SELECTOR)

interface MobilePhotoInspectorSheetProps {
  createPresentation?: typeof createInspectorSheetPresentation
  currentPhoto: PhotoManifest
  exifData: PickedExif | null
  isInteractive: boolean
  progress: MotionValue<number>
  resolveHeight?: typeof resolveInspectorSheetHeight
  onClose: () => void
}

export const MobilePhotoInspectorSheet = ({
  createPresentation = createInspectorSheetPresentation,
  currentPhoto,
  exifData,
  isInteractive,
  progress,
  resolveHeight = resolveInspectorSheetHeight,
  onClose,
}: MobilePhotoInspectorSheetProps) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<Tab>('info')
  const sheetRef = useRef<HTMLDivElement>(null)
  const viewportHeight = useViewport(value => value.h) || (typeof window !== 'undefined' ? window.innerHeight : 844)
  const { bottomInset, height: visualViewportHeight } = useVisualViewport()
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)

  // 高度基准只认 visualViewport：iOS Firefox 弹键盘时会缩小布局视口，但收起后不一定派发
  // window resize，window.innerHeight 会卡在键盘态的小值上，面板从此再也长不回来。
  const availableHeight = visualViewportHeight || viewportHeight
  const bottomOffset = bottomInset > MIN_BOTTOM_INSET ? bottomInset : 0

  // 键盘弹出时占满可用高度，把空间全给输入区；收起后回到常规比例。
  const sheetHeight = useMemo(
    () =>
      isKeyboardOpen
        ? Math.max(availableHeight - KEYBOARD_SHEET_TOP_GAP, KEYBOARD_SHEET_MIN_HEIGHT)
        : resolveHeight(availableHeight),
    [availableHeight, isKeyboardOpen, resolveHeight],
  )
  const sheetHeightValue = useMotionValue(sheetHeight)
  const sheetDragOffset = useMotionValue(0)

  useEffect(() => {
    sheetHeightValue.set(sheetHeight)
  }, [sheetHeight, sheetHeightValue])

  const showSocialFeatures = hasCommentPanel
  const { data: commentCount } = useQuery({
    queryKey: ['comment-count', currentPhoto.id],
    queryFn: () => getPhotoCommentCount(currentPhoto.id),
    enabled: canFetchPhotoCommentCount,
  })
  const hasComments = (commentCount?.count ?? 0) > 0

  useEffect(() => {
    setActiveTab('info')
  }, [currentPhoto.id])

  useEffect(() => {
    if (!isInteractive) {
      const { activeElement } = document
      if (activeElement instanceof HTMLElement && sheetRef.current?.contains(activeElement)) {
        activeElement.blur()
      }
      setIsKeyboardOpen(false)
      sheetDragOffset.set(0)
    }
  }, [isInteractive, sheetDragOffset])

  // 用焦点判定键盘态，而不是视口数值阈值：数值在 iOS Firefox 上可能不恢复，焦点信号一定会回落，
  // 面板高度就不会卡在被压矮的状态。
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) {
      return
    }

    let blurTimer = 0
    let scrollTimer = 0

    const handleFocusIn = (event: FocusEvent) => {
      const { target } = event
      if (!isEditableElement(target)) {
        return
      }

      window.clearTimeout(blurTimer)
      setIsKeyboardOpen(true)

      window.clearTimeout(scrollTimer)
      scrollTimer = window.setTimeout(() => {
        target.scrollIntoView({ block: 'center' })
      }, SCROLL_INTO_VIEW_DELAY)
    }

    const handleFocusOut = () => {
      window.clearTimeout(blurTimer)
      // 字段间切换焦点会先 focusout 再 focusin，延后一拍再判断，避免高度来回跳
      blurTimer = window.setTimeout(() => {
        const { activeElement } = document
        if (!isEditableElement(activeElement) || !sheet.contains(activeElement)) {
          setIsKeyboardOpen(false)
        }
      }, 80)
    }

    sheet.addEventListener('focusin', handleFocusIn)
    sheet.addEventListener('focusout', handleFocusOut)

    return () => {
      window.clearTimeout(blurTimer)
      window.clearTimeout(scrollTimer)
      sheet.removeEventListener('focusin', handleFocusIn)
      sheet.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  const handleClose = useCallback(() => {
    const { activeElement } = document
    if (activeElement instanceof HTMLElement && sheetRef.current?.contains(activeElement)) {
      activeElement.blur()
    }

    sheetDragOffset.set(0)
    onClose()
  }, [onClose, sheetDragOffset])

  // 从 motion value 读取高度，键盘引起的高度变化才能实时反映到 y / opacity / scale 上
  const getSheetPresentation = () =>
    createPresentation({ progress: progress.get(), sheetHeight: sheetHeightValue.get() })
  const sheetY = useTransform(() => getSheetPresentation().y + sheetDragOffset.get())
  const sheetOpacity = useTransform(() => getSheetPresentation().opacity)
  const sheetScale = useTransform(() => getSheetPresentation().scale)

  // 浏览器为了露出聚焦的输入框会去滚动 overflow: hidden 的祖先盒子（iOS Firefox 尤其明显），
  // 那会把整张面板顶出可视区，这里把它拉回原位，滚动交给内部的滚动容器处理。
  const handleSheetScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const sheet = event.currentTarget
    if (sheet.scrollTop !== 0) {
      sheet.scrollTop = 0
    }
    if (sheet.scrollLeft !== 0) {
      sheet.scrollLeft = 0
    }
  }, [])

  const bindHandle = useDrag(
    ({ active, down, last, movement: [, my], velocity: [, vy], direction: [, dy], tap }) => {
      if (!isInteractive) {
        return
      }
      if (tap) {
        return
      }

      if (active && down) {
        sheetDragOffset.set(Math.min(Math.max(my, 0), SHEET_HANDLE_MAX_DRAG))
      }

      if (last) {
        const offset = sheetDragOffset.get()
        const shouldClose = offset >= SHEET_HANDLE_CLOSE_DISTANCE || (dy > 0 && vy > 0.6 && offset > 24)

        if (shouldClose) {
          handleClose()
          return
        }

        animate(sheetDragOffset, 0, { duration: 0.18, ease: 'easeOut' })
      }
    },
    {
      axis: 'y',
      threshold: 6,
      filterTaps: true,
      pointer: { touch: true, capture: false },
      rubberband: 0.08,
    },
  )

  return (
    <m.div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center"
      aria-hidden={!isInteractive}
      inert={!isInteractive}
      style={{
        bottom: bottomOffset,
        y: sheetY,
        opacity: sheetOpacity,
      }}
    >
      <m.div
        ref={sheetRef}
        onScroll={handleSheetScroll}
        className="bg-material-ultra-thick border-accent/20 pointer-events-auto relative flex w-full max-w-screen-lg flex-col overflow-hidden rounded-t-[28px] border text-white backdrop-blur-3xl"
        style={{
          height: sheetHeight,
          scale: sheetScale,
          transformOrigin: '50% 100%',
          boxShadow:
            '0 -20px 64px color-mix(in srgb, var(--color-accent) 16%, transparent), 0 -8px 28px rgba(0, 0, 0, 0.32)',
          pointerEvents: isInteractive ? 'auto' : 'none',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-t-[28px]"
          style={{
            background:
              'linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 16%, color-mix(in srgb, var(--color-accent) 7%, transparent))',
          }}
        />

        <div className="relative z-10 flex shrink-0 flex-col px-4 pt-3">
          <div
            {...bindHandle()}
            className="mb-3 flex items-center justify-center py-1"
            aria-label="Drag handle to close details"
            data-viewer-interactive
          >
            <div className="h-1.5 w-11 rounded-full bg-white/20" />
          </div>

          <div className="relative">
            {showSocialFeatures ? (
              <MobileTabGroup
                value={activeTab}
                onValueChanged={value => setActiveTab(value as Tab)}
                className="mr-12"
              >
                <MobileTabItem
                  value="info"
                  label={(
                    <div className="flex items-center">
                      <i className="i-mingcute-information-line mr-1.5 text-base" />
                      {t('inspector.tab.info')}
                    </div>
                  )}
                />
                <MobileTabItem
                  value="comments"
                  label={(
                    <div className="flex items-center">
                      <i className="i-mingcute-comment-line mr-1.5 text-base" />
                      {t('inspector.tab.comments')}
                      {hasComments && <div className="bg-accent ml-1.5 size-1.5 rounded-full" />}
                    </div>
                  )}
                />
              </MobileTabGroup>
            ) : (
              <div className="px-2 pb-1 text-sm font-medium text-white/70">{t('exif.header.title')}</div>
            )}

            <button
              type="button"
              className="hover:bg-accent/10 absolute top-1 right-0 flex size-9 items-center justify-center rounded-xl text-white/80 transition-colors hover:text-white"
              onClick={handleClose}
              aria-label="Close details"
            >
              <i className="i-mingcute-close-line text-lg" />
            </button>
          </div>
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {activeTab === 'info' ? (
            <ExifPanelContent
              currentPhoto={currentPhoto}
              exifData={exifData}
              rootClassName="min-h-0 flex-1"
              viewportClassName="px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] **:select-text"
            />
          ) : (
            <div className="min-h-0 flex-1 pb-[calc(env(safe-area-inset-bottom)+8px)]">
              <CommentsPanel photoId={currentPhoto.id} />
            </div>
          )}
        </div>
      </m.div>
    </m.div>
  )
}
