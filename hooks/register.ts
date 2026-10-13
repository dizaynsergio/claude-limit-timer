import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

const WARN_MS = 60 * 60 * 1000 // напомнить за час до сброса
const TICK_MS = 30 * 1000 // как часто обновлять обратный отсчёт

// Ключи в $.store (между сессиями): resetsAt окна, для которого уже было событие
const SEEN = 'seenWindow' // окно видели до сброса — значит, о сбросе стоит сообщить
const WARNED = 'warnedWindow'
const ANNOUNCED = 'resetAnnouncedWindow'

let fiveHour: SessionRateLimit | undefined
let week: SessionRateLimit | undefined
let timer: { cancel: () => void } | undefined

function fmtLeft(ms: number): string {
  if (ms <= 0) return 'сейчас'
  const m = Math.ceil(ms / 60000)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h ? `${h}ч ${mm}м` : `${mm}м`
}

function take(limits: readonly SessionRateLimit[]) {
  fiveHour = limits.find(l => l.kind === 'five_hour') ?? fiveHour
  week = limits.find(l => l.kind === 'seven_day') ?? week
}

async function alert($: EngineInterface, text: string) {
  $.ui.toast(text, { timeoutMs: 10000 })
  try {
    await $.ui.notify(text, { title: 'Лимит Claude' })
  } catch {
    // уведомления выключены или их некуда показать — тоста достаточно
  }
}

async function refresh($: EngineInterface) {
  if (!fiveHour?.resetsAt) {
    $.ui.status('⏳ Лимит 5ч: данные появятся после первого ответа')
    return
  }
  const key = fiveHour.resetsAt
  const left = Date.parse(key) - (await $.clock.now())
  const pct = Math.round(fiveHour.percentUsed)
  const weekPart = week ? ` · неделя ${Math.round(week.percentUsed)}%` : ''

  if (left > 0) {
    $.ui.status(`⏳ Лимит 5ч: ${pct}% · сброс через ${fmtLeft(left)}${weekPart}`)
    if ((await $.store.get(SEEN)) !== key) await $.store.set(SEEN, key)

    if (left <= WARN_MS && (await $.store.get(WARNED)) !== key) {
      await $.store.set(WARNED, key)
      await alert($, `⏰ Через ${fmtLeft(left)} сбросится 5-часовой лимит (сейчас использовано ${pct}%)`)
    }
    return
  }

  $.ui.status(`✅ Лимит 5ч сброшен — 0%${weekPart}`)
  const seenBefore = (await $.store.get(SEEN)) === key
  if (seenBefore && (await $.store.get(ANNOUNCED)) !== key) {
    await $.store.set(ANNOUNCED, key)
    await alert($, '✅ 5-часовой лимит сбросился — можно снова работать на полную')
  }
}

function tick($: EngineInterface) {
  refresh($).catch(() => {})
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
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
