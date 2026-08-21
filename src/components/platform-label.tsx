import type { ReactNode } from 'react'
import { BrandIcon, UnknownBrowserIcon } from '@/components/brand-icon'
import { DetailTooltip, TooltipInline, TooltipInlineItem, tooltipPanelContent } from '@/components/detail-tooltip'
import {
  formatBrowserLabel,
  formatDeviceLabel,
  formatOsLabel,
  formatPlatformPrimary,
  resolveBrowserIcon,
  resolveDeviceIcon,
  resolveOsIcon,
} from '@/lib/brand-icons'
import { cn } from '@/lib/utils'

type PlatformTooltipProps = {
  browser?: string
  browserVersion?: string
  os?: string
  osVersion?: string
  device?: string
}

// Bespoke platform tooltip: a single inline spec line, ordered browser → device →
// OS (each with icon + mono version), separated by hairline dividers. An unrecognised
// browser falls back to a neutral glyph; an unrecognised OS stays iconless.
export const PlatformTooltip = ({ browser, browserVersion, os, osVersion, device }: PlatformTooltipProps) => {
  const browserIcon = resolveBrowserIcon(browser)
  const osIcon = resolveOsIcon(os)
  const items: ReactNode[] = []

  if (browser?.trim()) {
    items.push(
      <TooltipInlineItem
        key="browser"
        icon={<BrandIcon name={browserIcon} size={16} unknownGlyph={<UnknownBrowserIcon size={16} />} />}
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
        // Guarded here, unlike the labels below: TooltipInlineItem wraps any truthy icon in a
        // span, so an always-rendered BrandIcon would cost an empty span and a stray gap.
        icon={osIcon ? <BrandIcon name={osIcon} size={16} /> : undefined}
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
  const icon = resolveBrowserIcon(browser)

  if (!label) {
    return typeof fallback === 'string' ? <span className={className}>{fallback}</span> : fallback
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <BrandIcon name={icon} size={iconSize} unknownGlyph={<UnknownBrowserIcon size={iconSize} />} />
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
  const icon = resolveOsIcon(os)

  if (!label) {
    return typeof fallback === 'string' ? <span className={className}>{fallback}</span> : fallback
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <BrandIcon name={icon} size={iconSize} />
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
  const icon = resolveDeviceIcon(device, os)

  if (!label) {
    return typeof fallback === 'string' ? <span className={className}>{fallback}</span> : fallback
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <BrandIcon name={icon} size={iconSize} />
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
  const icon = resolveBrowserIcon(browser) ?? resolveOsIcon(os)
  // Only a row that names a browser earns the neutral glyph; an OS-only row would be
  // mislabelled by it.
  const unknownGlyph = browser?.trim() ? <UnknownBrowserIcon size={iconSize} /> : null

  if (!primary) {
    return typeof fallback === 'string' ? <span className={className}>{fallback}</span> : fallback
  }

  return (
    <DetailTooltip
      detail={<PlatformTooltip browser={browser} browserVersion={browserVersion} os={os} osVersion={osVersion} />}
      contentClassName={tooltipPanelContent}
      className={cn('items-center gap-1.5', className)}
    >
      <BrandIcon name={icon} size={iconSize} unknownGlyph={unknownGlyph} />
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
  const icon = resolveBrowserIcon(browser) ?? resolveOsIcon(os)
  const unknownGlyph = browserName ? <UnknownBrowserIcon size={iconSize} /> : null
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
        <BrandIcon name={icon} size={iconSize} unknownGlyph={unknownGlyph} />
        <span className="truncate">{primary}</span>
      </span>
      {secondary && <span className="max-w-full truncate text-xs text-muted-foreground">{secondary}</span>}
    </DetailTooltip>
  )
}
