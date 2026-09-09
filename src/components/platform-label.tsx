import type { ReactNode } from 'react'
import { BotBrowserIcon, BrandIcon, UnknownBrowserIcon } from '@/components/brand-icon'
import { DetailTooltip, TooltipInline, TooltipInlineItem, tooltipPanelContent } from '@/components/detail-tooltip'
import {
  browserForPlatform,
  formatBrowserLabel,
  formatDeviceLabel,
  formatOsLabel,
  formatOsName,
  formatPlatformPrimary,
  resolveBrowserIcon,
  resolveDeviceIcon,
  resolveOsIcon,
} from '@/lib/brand-icons'
import { cn } from '@/lib/utils'

// Reached only when the browser is already unmatched, where the globe would read as "unknown
// browser" rather than "not a person".
export const unknownBrowserGlyph = (bot: boolean | undefined, size: number) =>
  bot ? <BotBrowserIcon size={size} /> : <UnknownBrowserIcon size={size} />

type PlatformTooltipProps = {
  browser?: string
  browserVersion?: string
  os?: string
  osVersion?: string
  device?: string
  // The SDK's own target ('web' or the native OS). Native rows drop $browser — see browserForPlatform.
  platform?: string
  bot?: boolean
}

// Bespoke platform tooltip: a single inline spec line, ordered browser → device →
// OS (each with icon + mono version), separated by hairline dividers. An unrecognised
// browser falls back to a neutral glyph; an unrecognised OS stays iconless.
export const PlatformTooltip = ({
  browser,
  browserVersion,
  os,
  osVersion,
  device,
  platform,
  bot,
}: PlatformTooltipProps) => {
  const browserName = browserForPlatform(browser, platform)
  const browserIcon = resolveBrowserIcon(browserName)
  const osIcon = resolveOsIcon(os)
  const items: ReactNode[] = []

  // The icon slot only swaps when the browser is unmatched, so a datacenter Chrome keeps its mark —
  // this is the one place every bot row says so, and the only one a screen reader reaches.
  if (bot) {
    items.push(<TooltipInlineItem key="bot" label={<span className="text-muted-foreground">Automated</span>} />)
  }
  if (browserName?.trim()) {
    items.push(
      <TooltipInlineItem
        key="browser"
        icon={<BrandIcon name={browserIcon} size={16} unknownGlyph={unknownBrowserGlyph(bot, 16)} />}
        label={browserName}
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
        label={formatOsName(os)}
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
  platform?: string
  bot?: boolean
  className?: string
  fallback?: ReactNode
  iconSize?: number
}

export const BrowserLabel = ({
  browser,
  browserVersion,
  platform,
  bot,
  className,
  fallback = '—',
  iconSize = 16,
}: BrowserLabelProps) => {
  const browserName = browserForPlatform(browser, platform)
  const label = formatBrowserLabel(browserName, browserVersion)
  const icon = resolveBrowserIcon(browserName)

  if (!label) {
    return typeof fallback === 'string' ? <span className={className}>{fallback}</span> : fallback
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <BrandIcon name={icon} size={iconSize} unknownGlyph={unknownBrowserGlyph(bot, iconSize)} />
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
  device?: string
  platform?: string
  bot?: boolean
  className?: string
  fallback?: ReactNode
  iconSize?: number
}

export const PlatformLabel = ({
  browser,
  browserVersion,
  os,
  osVersion,
  device,
  platform,
  bot,
  className,
  fallback = '—',
  iconSize = 14,
}: PlatformLabelProps) => {
  // A native row has no browser to name, so the OS leads it — the same branch a browserless web row
  // already took, which is why suppressing here needs nothing further downstream.
  const browserName = browserForPlatform(browser, platform)?.trim()
  const primary = formatPlatformPrimary(browserName, os)
  // Single icon in the trigger, and a named browser owns that slot outright: unrecognised, it takes
  // a neutral glyph rather than borrowing the OS mark. The OS only leads when no browser is named
  // — and then there is no globe, which would mislabel the row. Full breakdown is in the tooltip.
  const icon = browserName ? resolveBrowserIcon(browserName) : resolveOsIcon(os)
  const unknownGlyph = browserName ? unknownBrowserGlyph(bot, iconSize) : null

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
          platform={platform}
          bot={bot}
        />
      }
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
  platform?: string
  bot?: boolean
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
  platform,
  bot,
  className,
  fallback = '—',
  iconSize = 16,
}: PlatformStackLabelProps) => {
  // Line 1 is the browser carrying its single icon; line 2 is the OS as plain
  // text. When there's no browser, the OS leads line 1 and line 2 is dropped.
  const browserName = browserForPlatform(browser, platform)?.trim()
  const osName = formatOsName(os)
  const icon = browserName ? resolveBrowserIcon(browserName) : resolveOsIcon(os)
  const unknownGlyph = browserName ? unknownBrowserGlyph(bot, iconSize) : null
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
          platform={platform}
          bot={bot}
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
