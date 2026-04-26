export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export interface DeviceInfo {
  type: DeviceType
  width: number
  pixelRatio: number
  isTouch: boolean
}

export function getDeviceInfo(): DeviceInfo {
  const width = window.innerWidth
  const pixelRatio = window.devicePixelRatio || 1
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  let type: DeviceType
  if (width < 768) {
    type = 'mobile'
  } else if (width < 1024) {
    type = 'tablet'
  } else {
    type = 'desktop'
  }

  return { type, width, pixelRatio, isTouch }
}

export function getImageSize(): 'small' | 'medium' | 'large' {
  const { type, pixelRatio } = getDeviceInfo()

  if (type === 'mobile') {
    return pixelRatio >= 2 ? 'medium' : 'small'
  } else if (type === 'tablet') {
    return 'medium'
  } else {
    return pixelRatio >= 2 ? 'large' : 'medium'
  }
}

export function getResponsiveImageUrl(baseUrl: string, size?: 'small' | 'medium' | 'large'): string {
  const resolvedSize = size || getImageSize()
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}size=${resolvedSize}&t=${Date.now()}`
}

export function observeViewportChange(callback: (deviceInfo: DeviceInfo) => void): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const handleResize = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      callback(getDeviceInfo())
    }, 150)
  }

  window.addEventListener('resize', handleResize)
  window.addEventListener('orientationchange', handleResize)

  callback(getDeviceInfo())

  return () => {
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('orientationchange', handleResize)
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

export function isMobile(): boolean {
  return getDeviceInfo().type === 'mobile'
}

export function isTablet(): boolean {
  return getDeviceInfo().type === 'tablet'
}

export function isDesktop(): boolean {
  return getDeviceInfo().type === 'desktop'
}

export function getBreakpoint(): 'mobile' | 'tablet' | 'desktop' {
  return getDeviceInfo().type
}

export function matchMedia(query: string): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(query).matches
}

export function isLandscape(): boolean {
  return matchMedia('(orientation: landscape)')
}

export function isPortrait(): boolean {
  return matchMedia('(orientation: portrait)')
}

export function supportsHighDPI(): boolean {
  return (window.devicePixelRatio || 1) >= 2
}

export function getRetinaSuffix(): string {
  return supportsHighDPI() ? '@2x' : ''
}
