/**
 * WebGL图像查看器React组件
 *
 * 高性能的WebGL图像查看器组件
 */

import * as React from 'react'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

import {
  defaultAlignmentAnimation,
  defaultDoubleClickConfig,
  defaultPanningConfig,
  defaultPinchConfig,
  defaultVelocityAnimation,
  defaultWheelConfig,
} from './constants'
import DebugInfoComponent from './DebugInfo'
import type { WebGLImageViewerProps, WebGLImageViewerRef } from './interface'
import { WebGLImageViewerEngine } from './WebGLImageViewerEngine'

/**
 * WebGL图像查看器组件
 */
export const WebGLImageViewer = ({
  ref,
  src,
  className = '',
  width,
  height,
  initialScale = 1,
  minScale = 0.1,
  maxScale = 10,
  wheel = defaultWheelConfig,
  pinch = defaultPinchConfig,
  doubleClick = defaultDoubleClickConfig,
  panning = defaultPanningConfig,
  limitToBounds = true,
  centerOnInit = true,
  smooth = true,
  alignmentAnimation = defaultAlignmentAnimation,
  velocityAnimation = defaultVelocityAnimation,
  onZoomChange,
  onImageCopied,
  onLoadingStateChange,
  debug = false,
  ...divProps
}: WebGLImageViewerProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, 'className'> & {
    ref?: React.RefObject<WebGLImageViewerRef | null>
  }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<WebGLImageViewerEngine | null>(null)
  const [tileOutlineEnabled, setTileOutlineEnabled] = useState(false)

  const setDebugInfoRef = useRef((() => {}) as (debugInfo: any) => void)
  const debugEnabled = Boolean(debug)

  const mergedWheel = useMemo(
    () => ({
      ...defaultWheelConfig,
      ...wheel,
    }),
    [wheel],
  )

  const mergedPinch = useMemo(
    () => ({
      ...defaultPinchConfig,
      ...pinch,
    }),
    [pinch],
  )

  const mergedDoubleClick = useMemo(
    () => ({
      ...defaultDoubleClickConfig,
      ...doubleClick,
    }),
    [doubleClick],
  )

  const mergedPanning = useMemo(
    () => ({
      ...defaultPanningConfig,
      ...panning,
    }),
    [panning],
  )

  const mergedAlignmentAnimation = useMemo(
    () => ({
      ...defaultAlignmentAnimation,
      ...alignmentAnimation,
    }),
    [alignmentAnimation],
  )

  const mergedVelocityAnimation = useMemo(
    () => ({
      ...defaultVelocityAnimation,
      ...velocityAnimation,
    }),
    [velocityAnimation],
  )

  const callbacksRef = useRef<
    Pick<Required<WebGLImageViewerProps>, 'onZoomChange' | 'onImageCopied' | 'onLoadingStateChange'>
  >({
    onZoomChange: onZoomChange || (() => {}),
    onImageCopied: onImageCopied || (() => {}),
    onLoadingStateChange: onLoadingStateChange || (() => {}),
  })

  callbacksRef.current = {
    onZoomChange: onZoomChange || (() => {}),
    onImageCopied: onImageCopied || (() => {}),
    onLoadingStateChange: onLoadingStateChange || (() => {}),
  }

  const interactionConfigRef = useRef<
    Pick<Required<WebGLImageViewerProps>, 'wheel' | 'pinch' | 'doubleClick' | 'panning'>
  >({
    wheel: mergedWheel,
    pinch: mergedPinch,
    doubleClick: mergedDoubleClick,
    panning: mergedPanning,
  })

  interactionConfigRef.current = {
    wheel: mergedWheel,
    pinch: mergedPinch,
    doubleClick: mergedDoubleClick,
    panning: mergedPanning,
  }

  useImperativeHandle(ref, () => ({
    zoomIn: (animated?: boolean) => viewerRef.current?.zoomIn(animated),
    zoomOut: (animated?: boolean) => viewerRef.current?.zoomOut(animated),
    resetView: () => viewerRef.current?.resetView(),
    getScale: () => viewerRef.current?.getScale() || 1,
  }))

  useEffect(() => {
    if (!canvasRef.current) return

    const webGLImageViewerEngine = new WebGLImageViewerEngine(
      canvasRef.current,
      {
        src,
        className: '',
        width: width || 0,
        height: height || 0,
        initialScale,
        minScale,
        maxScale,
        wheel: interactionConfigRef.current.wheel,
        pinch: interactionConfigRef.current.pinch,
        doubleClick: interactionConfigRef.current.doubleClick,
        panning: interactionConfigRef.current.panning,
        limitToBounds,
        centerOnInit,
        smooth,
        alignmentAnimation: mergedAlignmentAnimation,
        velocityAnimation: mergedVelocityAnimation,
        onZoomChange: callbacksRef.current.onZoomChange,
        onImageCopied: callbacksRef.current.onImageCopied,
        onLoadingStateChange: callbacksRef.current.onLoadingStateChange,
        debug: debugEnabled,
      },
      debugEnabled ? setDebugInfoRef : undefined,
    )

    try {
      // 如果提供了尺寸，传递给loadImage进行优化
      const preknownWidth = width && width > 0 ? width : undefined
      const preknownHeight = height && height > 0 ? height : undefined
      webGLImageViewerEngine.loadImage(src, preknownWidth, preknownHeight).catch(console.error)
      viewerRef.current = webGLImageViewerEngine
      setTileOutlineEnabled(webGLImageViewerEngine.isTileOutlineEnabled())
    } catch (error) {
      console.error('Failed to initialize WebGL Image Viewer:', error)
    }

    return () => {
      webGLImageViewerEngine?.destroy()
      viewerRef.current = null
    }
  }, [
    src,
    width,
    height,
    initialScale,
    minScale,
    maxScale,
    limitToBounds,
    centerOnInit,
    smooth,
    mergedAlignmentAnimation,
    mergedVelocityAnimation,
    debugEnabled,
  ])

  useEffect(() => {
    viewerRef.current?.updateCallbacks(callbacksRef.current)
  }, [onZoomChange, onImageCopied, onLoadingStateChange])

  useEffect(() => {
    viewerRef.current?.updateInteractionConfig(interactionConfigRef.current)
  }, [mergedWheel, mergedPinch, mergedDoubleClick, mergedPanning])

  const handleOutlineToggle = useCallback(
    (enabled: boolean) => {
      setTileOutlineEnabled(enabled)
      viewerRef.current?.setTileOutlineEnabled(enabled)
    },
    [setTileOutlineEnabled],
  )

  return (
    <div
      {...divProps}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        ...divProps.style,
      }}
    >
      <canvas
        ref={canvasRef}
        className={className}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          touchAction: 'none',
          border: 'none',
          outline: 'none',
          margin: 0,
          padding: 0,
          // 对于像素艺术和小图片保持锐利，使用最新的标准属性
          imageRendering: 'pixelated',
        }}
      />
      {debug && (
        <DebugInfoComponent
          outlineEnabled={tileOutlineEnabled}
          onToggleOutline={handleOutlineToggle}
          ref={(e) => {
            if (e) {
              setDebugInfoRef.current = e.updateDebugInfo
            }
          }}
        />
      )}
    </div>
  )
}

// 设置显示名称用于React DevTools
WebGLImageViewer.displayName = 'WebGLImageViewer'

// 导出类型定义

export { type WebGLImageViewerProps, type WebGLImageViewerRef } from './interface'
