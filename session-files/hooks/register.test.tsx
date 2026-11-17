import type { SessionMessage } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'session-files',
  component: 'Pane',
  requestId: 'session-files',
  props: {
    title: '本次製作的檔案',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const PAGE = 'D:\\proj\\docs\\page.html'
const NOTES = 'D:\\proj\\notes.md'
const TEST = 'D:\\proj\\page.test.ts'
const SCRATCH = 'C:\\Users\\me\\AppData\\Local\\Temp\\claude\\x\\scratchpad\\tmp.ps1'

const ask = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })
const wrote = (id: string, file_path: string, isNew = true): SessionMessage => ({
  role: 'assistant',
  text: '',
  toolUses: [
    { tool_use_id: id, tool: 'Write', input: { file_path }, result: { type: isNew ? 'create' : 'update' }, text: 'ok' },
  ],
})
const edited = (id: string, file_path: string): SessionMessage => ({
  role: 'assistant',
  text: '',
  toolUses: [{ tool_use_id: id, tool: 'Edit', input: { file_path }, text: 'ok' }],
})

/** Three rounds: the first makes the page, the second only talks, the third edits notes and writes minor files. */
const HISTORY: SessionMessage[] = [
  ask('做一個頁面'),
  wrote('t1', PAGE),
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: 'ok' }] as never },
  ask('<system-reminder>noise</system-reminder>這是什麼意思'),
  ask('<task-notification>a background task ended</task-notification>'),
  ask('把筆記整理一下'),
  edited('t2', NOTES),
  wrote('t3', TEST),
  wrote('t4', SCRATCH),
]

function engine(on: Parameters<TestBody>[1], history: SessionMessage[] = HISTORY) {
  on('command.register', () => ({ value: { command: 'session-files' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({ value: history }))
}

async function start($: Parameters<TestBody>[0]) {
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}

test('files are grouped under the round that made them, newest round first, on every surface', async ($, on) => {
  engine(on)
  await start($)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    if (surface === 'terminal') {
      // Round 3 is the latest question; the reminder and the task notice start no round.
      expect((await ui.find({ type: 'Text', text: /^#3/ }))?.text).toBe('#3 本輪')
      expect((await ui.find({ type: 'Text', text: /^#1/ }))?.text).toBe('#1 2 輪前')
    }
    expect((await ui.find({ type: 'Text', text: /page\.html/ }))?.text).toBe('page.html')
    expect(await ui.find({ key: `show:1:${PAGE}` })).toBeDefined()
    expect(await ui.find({ key: `show:3:${NOTES}` })).toBeDefined()
    await ui.unmount()
  }
})

test('minor files are hidden until asked for, and can be kept', async ($, on) => {
  engine(on)
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: `show:3:${TEST}` })).toBeUndefined()
  expect(await ui.find({ key: `show:3:${SCRATCH}` })).toBeUndefined()
  expect((await ui.find({ key: 'toggle-hidden' }))?.text).toBe('👁 2')

  await ui.press({ key: 'toggle-hidden' })
  expect(await ui.find({ key: `show:3:${TEST}` })).toBeDefined()
  await ui.press({ key: `unhide:3:${TEST}` })
  await ui.press({ key: 'toggle-hidden' })
  // The kept test file stays; the scratch file goes back into hiding.
  expect(await ui.find({ key: `show:3:${TEST}` })).toBeDefined()
  expect(await ui.find({ key: `show:3:${SCRATCH}` })).toBeUndefined()
  await ui.unmount()
})

test('× hides a file, and a round left empty disappears', async ($, on) => {
  engine(on)
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: `hide:1:${PAGE}` })
  expect(await ui.find({ key: `show:1:${PAGE}` })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^#1/ })).toBeUndefined()
  expect((await ui.find({ key: 'toggle-hidden' }))?.text).toBe('👁 3')
  await ui.unmount()
})

test('a file touched in several rounds: full card in its newest round, one line in older ones', async ($, on) => {
  engine(on, [...HISTORY, ask('頁面再改一下'), edited('t5', PAGE)])
  await start($)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // Newest round: the full card, with its button and a note of the earlier round.
    expect(await ui.find({ key: `show:4:${PAGE}` })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^page\.html/ }))?.text).toBe('page.html ↻')
    // Round 1: no button, just a line pointing at round 4.
    expect(await ui.find({ key: `show:1:${PAGE}` })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^↳/ }))?.text).toBe('↳ page.html ⤴4')
    await ui.unmount()
  }
})

test('a change made now joins the current round before the transcript has it', async ($, on) => {
  engine(on, [ask('第一個問題'), ask('再做一個檔案')])
  on('tool.call', () => ({ result: { type: 'create' } }))
  await start($)
  await $.tool.call({ tool: 'Write', file_path: PAGE, content: 'x' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^#2/ }))?.text).toBe('#2 本輪')
  expect(await ui.find({ key: `show:2:${PAGE}` })).toBeDefined()
  await ui.unmount()
})

test('the show button runs the Explorer script, then shows a check', async ($, on) => {
  const runs: { argv: string[]; env?: Record<string, string> }[] = []
  engine(on)
  on('process.run', (_, e) => {
    runs.push({ argv: [...e.argv], env: e.init?.env })
    return { value: { exitCode: 0, stdout: '', stderr: '' } as never }
  })
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: `show:1:${PAGE}` })
  expect(await ui.find({ key: `show:1:${PAGE}` })).toBeUndefined()
  await ui.unmount()

  expect(runs[0]?.argv[0]).toBe('powershell.exe')
  expect(runs[0]?.env?.SESSION_FILES_PATH).toBe(PAGE)
})

test('a failure says why and offers a retry', async ($, on) => {
  engine(on)
  on('process.run', () => ({ value: { exitCode: 3, stdout: '', stderr: '' } as never }))
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: `show:1:${PAGE}` })
  expect((await ui.find({ type: 'Text', text: /找不到檔案/ }))?.text).toMatch(/移動或刪除/)
  expect((await ui.find({ key: `show:1:${PAGE}` }))?.text).toBe('↻')
  await ui.unmount()
})
