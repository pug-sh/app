import type { ReactNode } from 'react'
import { DetailTooltip, TooltipInline, TooltipInlineItem, tooltipPanelContent } from '@/components/detail-tooltip'
import { Devicon } from '@/components/devicon'
import {
  formatBrowserLabel,
  formatDeviceLabel,
  formatOsLabel,
  formatPlatformPrimary,
  resolveBrowserDevicon,
  resolveDeviceDevicon,
  resolveOsDevicon,
} from '@/lib/devicon-map'
import { cn } from '@/lib/utils'

type PlatformTooltipProps = {
  browser?: string
  browserVersion?: string
  os?: string
  osVersion?: string
  device?: string
}

// Bespoke platform tooltip: a single inline spec line, ordered browser → device →
// OS (each with icon + mono version), separated by hairline dividers. Falls back
// to a neutral glyph when a brand icon isn't known.
export const PlatformTooltip = ({ browser, browserVersion, os, osVersion, device }: PlatformTooltipProps) => {
  const browserIcon = resolveBrowserDevicon(browser)
  const osIcon = resolveOsDevicon(os)
  const items: ReactNode[] = []

  if (browser?.trim()) {
    items.push(
      <TooltipInlineItem
        key="browser"
        icon={browserIcon ? <Devicon name={browserIcon} size={16} /> : undefined}
        label={browser}
        version={browserVersion}
      />,
    )
  }
  if (device?.trim()) {
    items.push(<TooltipInlineItem key="device" label={<span className="text-muted-foreground">{device}</span>} />)
  }
  if (os?.trim()) {
    items.push(
      <TooltipInlineItem
        key="os"
        icon={osIcon ? <Devicon name={osIcon} size={16} /> : undefined}
        label={os}
        version={osVersion}
      />,
    )
  }

  if (!items.length) return null
  return <TooltipInline items={items} />
}

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

export const DeviceLabel = ({ device, os, className, fallback = '—', iconSize = 16 }: DeviceLabelProps) => {
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
  // Single icon in the trigger — prefer the browser, fall back to the OS so an
  // OS-only row still shows a glyph. The full browser + OS breakdown is in the tooltip.
  const icon = resolveBrowserDevicon(browser) ?? resolveOsDevicon(os)

  if (!primary) {
    return typeof fallback === 'string' ? <span className={className}>{fallback}</span> : fallback
  }

  return (
    <DetailTooltip
      detail={<PlatformTooltip browser={browser} browserVersion={browserVersion} os={os} osVersion={osVersion} />}
      contentClassName={tooltipPanelContent}
      className={cn('items-center gap-1.5', className)}
    >
      {icon && <Devicon name={icon} size={iconSize} />}
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
  // Line 1 is the browser carrying its single icon; line 2 is the OS as plain
  // text. When there's no browser, the OS leads line 1 and line 2 is dropped.
  const browserName = browser?.trim()
  const osName = os?.trim()
  const icon = resolveBrowserDevicon(browser) ?? resolveOsDevicon(os)
  const primary = browserName || osName || formatDeviceLabel(device, os)
  const secondary = browserName ? osName : undefined

  if (!primary) {
    return typeof fallback === 'string' ? <span className={className}>{fallback}</span> : fallback
  }

  return (
    <DetailTooltip
      detail={
        <PlatformTooltip
          browser={browser}
          browserVersion={browserVersion}
          os={os}
          osVersion={osVersion}
          device={device}
        />
      }
      contentClassName={tooltipPanelContent}
      className={cn('flex-col items-start gap-0.5', className)}
    >
      <span className="flex max-w-full items-center gap-1.5">
        {icon && <Devicon name={icon} size={iconSize} />}
        <span className="truncate">{primary}</span>
      </span>
      {secondary && <span className="max-w-full truncate text-xs text-muted-foreground">{secondary}</span>}
    </DetailTooltip>
  )
}
