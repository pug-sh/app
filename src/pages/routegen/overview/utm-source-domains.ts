// UTM-source token → domain, for the Sources panel's favicons. A `$utmSource` value is a free-text
// token ("google", "producthunt", "newsletter"), not a hostname, so the favicon service can't resolve
// it directly — this maps the well-known ones to the domain whose favicon represents them. Unmapped
// tokens (custom campaign sources, "newsletter"/"email", …) resolve to undefined and render iconless.
//
// Keys are separator-free lowercase (normalized below), so "product_hunt" / "product-hunt" /
// "producthunt" all hit one entry. Curated toward a dev/SaaS audience; extend freely — a miss only
// costs an icon, never correctness.
const UTM_SOURCE_DOMAINS: Record<string, string> = {
  // Search
  google: 'google.com',
  bing: 'bing.com',
  yahoo: 'yahoo.com',
  duckduckgo: 'duckduckgo.com',
  ddg: 'duckduckgo.com',
  baidu: 'baidu.com',
  yandex: 'yandex.com',
  ecosia: 'ecosia.org',
  // Social
  facebook: 'facebook.com',
  fb: 'facebook.com',
  instagram: 'instagram.com',
  ig: 'instagram.com',
  twitter: 'twitter.com',
  x: 'x.com',
  linkedin: 'linkedin.com',
  reddit: 'reddit.com',
  youtube: 'youtube.com',
  yt: 'youtube.com',
  pinterest: 'pinterest.com',
  tiktok: 'tiktok.com',
  snapchat: 'snapchat.com',
  threads: 'threads.net',
  bluesky: 'bsky.app',
  bsky: 'bsky.app',
  mastodon: 'mastodon.social',
  twitch: 'twitch.tv',
  quora: 'quora.com',
  // Dev / community
  github: 'github.com',
  gitlab: 'gitlab.com',
  producthunt: 'producthunt.com',
  hackernews: 'news.ycombinator.com',
  hn: 'news.ycombinator.com',
  ycombinator: 'news.ycombinator.com',
  medium: 'medium.com',
  devto: 'dev.to',
  stackoverflow: 'stackoverflow.com',
  substack: 'substack.com',
  // Messaging
  discord: 'discord.com',
  slack: 'slack.com',
  telegram: 'telegram.org',
  whatsapp: 'whatsapp.com',
}

// Resolve a UTM-source token to a domain for favicon lookup, or undefined when unknown. A token that
// is already a domain (some sites set utm_source=news.ycombinator.com) is used as-is; otherwise the
// token is matched separator-insensitively against the curated map.
export const utmSourceDomain = (source: string) => {
  const raw = source.trim().toLowerCase()
  if (!raw) return undefined
  if (raw.includes('.')) return raw
  return UTM_SOURCE_DOMAINS[raw.replace(/[\s_-]+/g, '')]
}
