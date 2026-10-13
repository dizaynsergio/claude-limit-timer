import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const MIN = 60 * 1000
const START = Date.parse('2026-10-13T06:00:00Z')

const LIMITS = [
  { kind: 'five_hour', percentUsed: 44, resetsAt: new Date(START + 90 * MIN).toISOString() },
  { kind: 'seven_day', percentUsed: 12.5, resetsAt: new Date(START + 3 * 24 * 60 * MIN).toISOString() },
]

function engine(on: On, rateLimits: typeof LIMITS, env: Record<string, string> = {}) {
  const clock = mock.clock(on, { now: START })
  mock.store(on)
  mock.env(on, env)
  const seen = { statuses: [] as (string | undefined)[], toasts: [] as string[], notes: [] as string[] }
  on('ui.status', (_$, e) => {
    seen.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.notify', (_$, e) => {
    seen.notes.push(e.text)
    return { value: { isSent: false, reason: 'disabled' } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 200000 }, rateLimits } }))
  return { clock, seen }
}

const START_ARGS = { cwd: '/', surface: null, isInteractive: true } as const

test('ru: остаток, напоминание за час, сообщение о сбросе', { options: { language: 'ru' } }, async ($, on) => {
  const { clock, seen } = engine(on, LIMITS)

  await $.session.start(START_ARGS)
  expect(seen.statuses.at(-1)).toBe('⏳ Лимит 5ч: 44% · сброс через 1ч 30м · неделя 13%')
  expect(seen.toasts).toEqual([])

  await clock.advance(31 * MIN)
  expect(seen.toasts.length).toBe(1)
  expect(seen.toasts[0]).toContain('⏰')
  expect(seen.notes.length).toBe(1)

  await clock.advance(30 * MIN)
  expect(seen.toasts.length).toBe(1)

  await clock.advance(30 * MIN)
  expect(seen.toasts.length).toBe(2)
  expect(seen.toasts[1]).toContain('сбросился')
  expect(seen.statuses.at(-1)).toBe('✅ Лимит 5ч сброшен — 0% · неделя 13%')

  await clock.advance(5 * MIN)
  expect(seen.toasts.length).toBe(2)
})

test('en: status, one-hour reminder and reset notice', { options: { language: 'en' } }, async ($, on) => {
  const { clock, seen } = engine(on, LIMITS)

  await $.session.start(START_ARGS)
  expect(seen.statuses.at(-1)).toBe('⏳ 5h limit: 44% · resets in 1h 30m · week 13%')

  await clock.advance(31 * MIN)
  expect(seen.toasts[0]).toBe('⏰ The 5-hour limit resets in 1h (44% used so far)')

  await clock.advance(60 * MIN)
  expect(seen.toasts[1]).toContain('has reset')
  expect(seen.statuses.at(-1)).toBe('✅ 5h limit reset — 0% · week 13%')
})

test('auto picks Russian for a ru_* locale', async ($, on) => {
  const { seen } = engine(on, LIMITS, { LANG: 'ru_RU.UTF-8' })
  await $.session.start(START_ARGS)
  expect(seen.statuses.at(-1)).toContain('Лимит 5ч')
})

test('auto picks English for any other locale', async ($, on) => {
  const { seen } = engine(on, LIMITS, { LANG: 'en_US.UTF-8' })
  await $.session.start(START_ARGS)
  expect(seen.statuses.at(-1)).toContain('5h limit')
})

test('no limit data: shows a hint and stays quiet', { options: { language: 'ru' } }, async ($, on) => {
  const { seen } = engine(on, [])
  await $.session.start(START_ARGS)
  expect(seen.statuses.at(-1)).toContain('после первого ответа')
  expect(seen.toasts).toEqual([])
})
