import type { DeviconName } from '@/lib/devicon-map'
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

const PUBLIC_DEVICON_ASSETS: Record<'edge' | 'ios' | 'macos', string> = {
  edge: '/devicon/edge.svg',
  ios: '/devicon/ios.svg',
  macos: '/devicon/macos.svg',
}

const DEVICON_ASSETS: Record<Exclude<DeviconName, 'edge' | 'ios' | 'macos'>, string> = {
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

export const deviconSrc = (name: DeviconName) => {
  if (name === 'edge' || name === 'ios' || name === 'macos') return PUBLIC_DEVICON_ASSETS[name]
  return DEVICON_ASSETS[name]
}
