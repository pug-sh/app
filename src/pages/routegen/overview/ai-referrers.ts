// Ingest books AI products' visits to this channel (internal/attribution/channel.go). Its aiDomains and aiSources
// are copied here, matched exactly, to catch visits from before the channel. Change both together.
export const AI_CHANNEL = 'AI Assistants'

export const AI_REFERRER_DOMAINS = [
  'chatgpt.com',
  'chat.openai.com',
  'perplexity.ai',
  'claude.ai',
  'gemini.google.com',
  'copilot.microsoft.com',
  'chat.mistral.ai',
  'meta.ai',
  'grok.com',
  'chat.deepseek.com',
  'kimi.com',
  'you.com',
  'phind.com',
  'poe.com',
]

const AI_SOURCE_NAMES = [
  ['chatgpt', 'ChatGPT'],
  ['openai', 'OpenAI'],
  ['perplexity', 'Perplexity'],
  ['claude', 'Claude'],
  ['gemini', 'Gemini'],
  ['copilot', 'Copilot'],
  ['mistral', 'Mistral'],
  ['grok', 'Grok'],
  ['deepseek', 'DeepSeek'],
  ['kimi', 'Kimi'],
  ['phind', 'Phind'],
  ['poe', 'Poe'],
]

// A utm_source can be a bare name or the product's own domain (ChatGPT tags its links utm_source=chatgpt.com).
// Ingest lowercases a source to classify it but stores it as sent, so each name is matched in its brand's casing too.
export const AI_UTM_SOURCES = [...AI_SOURCE_NAMES.flat(), ...AI_REFERRER_DOMAINS]
