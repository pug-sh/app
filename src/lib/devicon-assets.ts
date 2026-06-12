import androidOriginal from 'devicon/icons/android/android-original.svg?url'
import chromeOriginal from 'devicon/icons/chrome/chrome-original.svg?url'
import debianOriginal from 'devicon/icons/debian/debian-original.svg?url'
import fedoraOriginal from 'devicon/icons/fedora/fedora-original.svg?url'
import firefoxOriginal from 'devicon/icons/firefox/firefox-original.svg?url'
import linuxOriginal from 'devicon/icons/linux/linux-original.svg?url'
import operaOriginal from 'devicon/icons/opera/opera-original.svg?url'
import safariOriginal from 'devicon/icons/safari/safari-original.svg?url'
import ubuntuOriginal from 'devicon/icons/ubuntu/ubuntu-original.svg?url'
import windows11Original from 'devicon/icons/windows11/windows11-original.svg?url'
import type { DeviconName } from '@/lib/devicon-map'

// Browsers/OSes whose devicon isn't in the npm package — self-hosted under public/.
// This map is the single source of truth for the public/bundled split: the bundled
// asset map and the runtime guard below both derive from its keys.
const PUBLIC_DEVICON_ASSETS = {
  edge: '/devicon/edge.svg',
  ios: '/devicon/ios.svg',
  macos: '/devicon/macos.svg',
} satisfies Partial<Record<DeviconName, string>>

type PublicDeviconName = keyof typeof PUBLIC_DEVICON_ASSETS

const isPublicDevicon = (name: DeviconName): name is PublicDeviconName => name in PUBLIC_DEVICON_ASSETS

const DEVICON_ASSETS: Record<Exclude<DeviconName, PublicDeviconName>, string> = {
  'android-original': androidOriginal,
  'chrome-original': chromeOriginal,
  'debian-original': debianOriginal,
  'fedora-original': fedoraOriginal,
  'firefox-original': firefoxOriginal,
  'linux-original': linuxOriginal,
  'opera-original': operaOriginal,
  'safari-original': safariOriginal,
  'ubuntu-original': ubuntuOriginal,
  'windows11-original': windows11Original,
}

export const deviconSrc = (name: DeviconName) =>
  isPublicDevicon(name) ? PUBLIC_DEVICON_ASSETS[name] : DEVICON_ASSETS[name]
