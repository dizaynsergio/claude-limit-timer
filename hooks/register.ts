import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

const WARN_MS = 60 * 60 * 1000 // remind one hour before the reset
const TICK_MS = 30 * 1000 // countdown refresh interval

// $.store keys (kept across sessions): the resetsAt of the window each event already fired for
const SEEN = 'seenWindow' // the window was seen before its reset, so the reset is worth announcing
const WARNED = 'warnedWindow'
const ANNOUNCED = 'resetAnnouncedWindow'

type Lang = 'ru' | 'en'

const TEXT = {
  ru: {
    title: 'Лимит Claude',
    h: 'ч',
    m: 'м',
    now: 'сейчас',
    noData: '⏳ Лимит 5ч: данные появятся после первого ответа',
    week: (p: number) => ` · неделя ${p}%`,
    status: (p: number, left: string, week: string) => `⏳ Лимит 5ч: ${p}% · сброс через ${left}${week}`,
    resetStatus: (week: string) => `✅ Лимит 5ч сброшен — 0%${week}`,
    warn: (left: string, p: number) => `⏰ Через ${left} сбросится 5-часовой лимит (сейчас использовано ${p}%)`,
    reset: '✅ 5-часовой лимит сбросился — можно снова работать на полную',
  },
  en: {
    title: 'Claude limit',
    h: 'h',
    m: 'm',
    now: 'now',
    noData: '⏳ 5h limit: data appears after the first reply',
    week: (p: number) => ` · week ${p}%`,
    status: (p: number, left: string, week: string) => `⏳ 5h limit: ${p}% · resets in ${left}${week}`,
    resetStatus: (week: string) => `✅ 5h limit reset — 0%${week}`,
    warn: (left: string, p: number) => `⏰ The 5-hour limit resets in ${left} (${p}% used so far)`,
    reset: '✅ The 5-hour limit has reset — you are back at full speed',
  },
}

let lang: Lang = 'en'
let fiveHour: SessionRateLimit | undefined
let week: SessionRateLimit | undefined
let timer: { cancel: () => void } | undefined

function fmtLeft(ms: number): string {
  const t = TEXT[lang]
  if (ms <= 0) return t.now
  const m = Math.ceil(ms / 60000)
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (!h) return `${mm}${t.m}`
  return mm ? `${h}${t.h} ${mm}${t.m}` : `${h}${t.h}`
}

function take(limits: readonly SessionRateLimit[]) {
  fiveHour = limits.find(l => l.kind === 'five_hour') ?? fiveHour
  week = limits.find(l => l.kind === 'seven_day') ?? week
}

async function pickLang($: EngineInterface, setting: unknown): Promise<Lang> {
  if (setting === 'ru' || setting === 'en') return setting
  const locale =
    (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG')) || (await systemLocale($))
  return locale.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

// Apps started from the macOS Dock (the Claude desktop app) get no LANG, and Intl here always says en-US,
// so ask macOS itself. ponytail: macOS only; Windows/Linux without LANG fall back to English
async function systemLocale($: EngineInterface): Promise<string> {
  try {
    const { exitCode, stdout } = await $.process.run(['defaults', 'read', '-g', 'AppleLocale'], { timeoutMs: 3000 })
    return exitCode === 0 ? stdout.trim() : ''
  } catch {
    return '' // no `defaults` on this system
  }
}

async function alert($: EngineInterface, text: string) {
  $.ui.toast(text, { timeoutMs: 10000 })
  try {
    await $.ui.notify(text, { title: TEXT[lang].title })
  } catch {
    // notifications are off or have nowhere to go; the toast is enough
  }
}

async function refresh($: EngineInterface) {
  const t = TEXT[lang]
  if (!fiveHour?.resetsAt) {
    $.ui.status(t.noData)
    return
  }
  const key = fiveHour.resetsAt
  const left = Date.parse(key) - (await $.clock.now())
  const pct = Math.round(fiveHour.percentUsed)
  const weekPart = week ? t.week(Math.round(week.percentUsed)) : ''

  if (left > 0) {
    $.ui.status(t.status(pct, fmtLeft(left), weekPart))
    if ((await $.store.get(SEEN)) !== key) await $.store.set(SEEN, key)

    if (left <= WARN_MS && (await $.store.get(WARNED)) !== key) {
      await $.store.set(WARNED, key)
      await alert($, t.warn(fmtLeft(left), pct))
    }
    return
  }

  $.ui.status(t.resetStatus(weekPart))
  const seenBefore = (await $.store.get(SEEN)) === key
  if (seenBefore && (await $.store.get(ANNOUNCED)) !== key) {
    await $.store.set(ANNOUNCED, key)
    await alert($, t.reset)
  }
}

function tick($: EngineInterface) {
  refresh($).catch(() => {})
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    lang = await pickLang($, options.language)
    take((await $.session.usage()).rateLimits)
    await refresh($)
    timer?.cancel()
    timer = $.clock.every(TICK_MS, () => tick($))
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      take(e.rateLimits)
      await refresh($)
    }
    return next(e)
  })
}
