import type { ReactNode } from 'react'
import { Monitor, Smartphone } from 'lucide-react'
import { DetailTooltip } from '@/components/detail-tooltip'
import { Devicon } from '@/components/devicon'
import type { DeviconName } from '@/lib/devicon-map'
import {
  formatBrowserLabel,
  formatDeviceLabel,
  formatOsLabel,
  formatPlatformDetail,
  formatPlatformPrimary,
  formatPlatformStackDetail,
  formatPlatformStackPrimary,
  isMobileDevice,
  resolveBrowserDevicon,
  resolveDeviceDevicon,
  resolveOsDevicon,
} from '@/lib/devicon-map'
import { cn } from '@/lib/utils'

type BrowserLabelProps = {
  browser?: string
  browserVersion?: string
  className?: string
  fallback?: ReactNode
  iconSize?: number
}

export const BrowserLabel = ({
  browser,
  browserVersion,
  className,
  fallback = '—',
  iconSize = 16,
}: BrowserLabelProps) => {
  const label = formatBrowserLabel(browser, browserVersion)
  const icon = resolveBrowserDevicon(browser)

  if (!label) {
    return typeof fallback === 'string' ? <span className={className}>{fallback}</span> : fallback
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {icon && <Devicon name={icon} size={iconSize} />}
      <span className="truncate">{label}</span>
    </span>
  )
}

type OsLabelProps = {
  os?: string
  osVersion?: string
  className?: string
  fallback?: ReactNode
  iconSize?: number
}

export const OsLabel = ({ os, osVersion, className, fallback = '—', iconSize = 16 }: OsLabelProps) => {
  const label = formatOsLabel(os, osVersion)
  const icon = resolveOsDevicon(os)

  if (!label) {
    return typeof fallback === 'string' ? <span className={className}>{fallback}</span> : fallback
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {icon && <Devicon name={icon} size={iconSize} />}
      <span className="truncate">{label}</span>
    </span>
  )
}

type DeviceLabelProps = {
  device?: string
  os?: string
  className?: string
  fallback?: ReactNode
  iconSize?: number
}

export const DeviceLabel = ({
  device,
  os,
  className,
  fallback = '—',
  iconSize = 16,
}: DeviceLabelProps) => {
  const label = formatDeviceLabel(device, os)
  const icon = resolveDeviceDevicon(device, os)

  if (!label) {
    return typeof fallback === 'string' ? <span className={className}>{fallback}</span> : fallback
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {icon && <Devicon name={icon} size={iconSize} />}
      <span className="truncate">{label}</span>
    </span>
  )
}

type PlatformLabelProps = {
  browser?: string
  browserVersion?: string
  os?: string
  osVersion?: string
  className?: string
  fallback?: ReactNode
  iconSize?: number
}

export const PlatformLabel = ({
  browser,
  browserVersion,
  os,
  osVersion,
  className,
  fallback = '—',
  iconSize = 14,
}: PlatformLabelProps) => {
  const primary = formatPlatformPrimary(browser, os)
  const detail = formatPlatformDetail(browser, browserVersion, os, osVersion)
  const browserIcon = resolveBrowserDevicon(browser)
  const osIcon = resolveOsDevicon(os)

  if (!primary) {
    return typeof fallback === 'string' ? <span className={className}>{fallback}</span> : fallback
  }

  return (
    <DetailTooltip detail={detail !== primary ? detail : undefined} className={className}>
      {browserIcon && <Devicon name={browserIcon} size={iconSize} />}
      {osIcon && <Devicon name={osIcon} size={iconSize} />}
      <span className="truncate">{primary}</span>
    </DetailTooltip>
  )
}

type PlatformStackLabelProps = {
  browser?: string
  browserVersion?: string
  os?: string
  osVersion?: string
  device?: string
  className?: string
  fallback?: ReactNode
  iconSize?: number
}

export const PlatformStackLabel = ({
  browser,
  browserVersion,
  os,
  osVersion,
  device,
  className,
  fallback = '—',
  iconSize = 16,
}: PlatformStackLabelProps) => {
  const primary = formatPlatformStackPrimary(browser, browserVersion, os, osVersion, device)
  const detail = formatPlatformStackDetail(browser, browserVersion, os, osVersion, device)

  if (!primary) {
    return typeof fallback === 'string' ? <span className={className}>{fallback}</span> : fallback
  }

  const browserIcon = resolveBrowserDevicon(browser)
  const osIcon = resolveOsDevicon(os)
  const icons = [...new Set([browserIcon, osIcon].filter((icon): icon is DeviconName => !!icon))]
  const mobile = isMobileDevice(device, os)
  const DeviceTypeIcon = mobile ? Smartphone : Monitor
  const showDeviceTypeIcon = !!(os || device)

  return (
    <DetailTooltip detail={detail} className={cn('items-center gap-1.5', className)}>
      {icons.map(icon => (
        <Devicon key={icon} name={icon} size={iconSize} />
      ))}
      {showDeviceTypeIcon && (
        <DeviceTypeIcon className="shrink-0 text-muted-foreground" style={{ width: iconSize, height: iconSize }} />
      )}
      {icons.length === 0 && !showDeviceTypeIcon && <span className="truncate">{primary}</span>}
    </DetailTooltip>
  )
}
