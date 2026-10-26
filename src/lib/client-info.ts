export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export function parseDevice(userAgent: string): DeviceType {
  const ua = userAgent.toLowerCase()
  if (
    ua.includes('ipad') ||
    ua.includes('tablet') ||
    (ua.includes('android') && !ua.includes('mobile'))
  ) {
    return 'tablet'
  }
  if (ua.includes('iphone') || ua.includes('ipod') || ua.includes('mobi')) {
    return 'mobile'
  }
  return 'desktop'
}

export function parseBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase()
  if (ua.includes('fban') || ua.includes('fbav')) return 'Facebook app'
  if (ua.includes('instagram')) return 'Instagram app'
  if (ua.includes('edg/') || ua.includes('edga/') || ua.includes('edgios/')) return 'Edge'
  if (ua.includes('opr/') || ua.includes('opera')) return 'Opera'
  if (ua.includes('samsungbrowser')) return 'Samsung Internet'
  if (ua.includes('firefox/') || ua.includes('fxios')) return 'Firefox'
  if (ua.includes('chrome/') || ua.includes('crios')) return 'Chrome'
  if (ua.includes('safari/')) return 'Safari'
  return 'Other'
}

export function referrerHost(referer: string | null | undefined): string | null {
  if (!referer) return null
  try {
    const host = new URL(referer).hostname.toLowerCase().replace(/^www\./, '')
    return host || null
  } catch {
    return null
  }
}