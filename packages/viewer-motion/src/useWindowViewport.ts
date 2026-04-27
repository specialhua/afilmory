import { useEffect, useState } from 'react'

const getViewport = () => ({
  width: typeof window !== 'undefined' ? window.innerWidth : 390,
  height: typeof window !== 'undefined' ? window.innerHeight : 844,
})

export const useWindowViewport = () => {
  const [viewport, setViewport] = useState(getViewport)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const updateViewport = () => {
      setViewport(getViewport())
    }

    updateViewport()
    window.addEventListener('resize', updateViewport)

    return () => {
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  return viewport
}
