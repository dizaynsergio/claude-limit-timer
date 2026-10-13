import { expect, mock, test } from 'claude-code/testing'

const MIN = 60 * 1000
const START = Date.parse('2026-10-13T06:00:00Z')

test('показывает остаток, напоминает за час и сообщает о сбросе', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  mock.store(on)

  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  const notes: string[] = []

  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.notify', (_$, e) => {
    notes.push(e.text)
    return { value: { isSent: false, reason: 'disabled' } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: {
    startedAt: START,
    context: { window: 200000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 44, resetsAt: new Date(START + 90 * MIN).toISOString() },
      { kind: 'seven_day', percentUsed: 12.5, resetsAt: new Date(START + 3 * 24 * 60 * MIN).toISOString() },
    ],
    },
  }))

  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  expect(statuses.at(-1)).toBe('⏳ Лимит 5ч: 44% · сброс через 1ч 30м · неделя 13%')
  expect(toasts).toEqual([])

  // 31 минута спустя — до сброса меньше часа
  await clock.advance(31 * MIN)
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('⏰')
  expect(notes.length).toBe(1)

  // ещё полчаса — напоминание не повторяется
  await clock.advance(30 * MIN)
  expect(toasts.length).toBe(1)

  // окно истекло — сообщение о сбросе, один раз
  await clock.advance(30 * MIN)
  expect(toasts.length).toBe(2)
  expect(toasts[1]).toContain('сбросился')
  expect(statuses.at(-1)).toBe('✅ Лимит 5ч сброшен — 0% · неделя 13%')

  await clock.advance(5 * MIN)
  expect(toasts.length).toBe(2)
})

test('без данных о лимите показывает подсказку и молчит', async ($, on) => {
  mock.clock(on, { now: START })
  mock.store(on)
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: START, context: { window: 200000 }, rateLimits: [] } }))

  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
  expect(statuses.at(-1)).toContain('после первого ответа')
  expect(toasts).toEqual([])
})
