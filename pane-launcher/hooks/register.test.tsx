import type { CommandInfo } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const LIST = {
  plugin: 'pane-launcher',
  component: 'AbovePromptList',
  props: {
    rows: [],
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

const COMMANDS: CommandInfo[] = [
  { name: 'session-files', description: '🗂 開啟「檔案」面板：這個對話每一輪製作的檔案', source: 'plugin', plugin: 'session-files' },
  { name: 'notes', description: '開啟「筆記」面板', source: 'plugin', plugin: 'notes' },
  { name: 'compact', description: 'Compact the conversation', source: 'builtin' },
  { name: 'hello', description: 'Say hi', source: 'plugin', plugin: 'x' },
]

test('a slim launcher column beside the band, one per pane command; pressing runs it', async ($, on) => {
  const ran: string[] = []
  on('command.list', () => ({ value: COMMANDS }))
  on('command.run', (_, e) => {
    ran.push(e.command)
    return { text: '' }
  })

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...LIST, surface } as never)
    // An icon in the description is the whole button; without one, ▤ and the short name.
    expect((await ui.find({ key: 'open:session-files' }))?.text).toBe('🗂')
    expect((await ui.find({ key: 'open:notes' }))?.text).toBe('▤ 筆記')
    expect(await ui.find({ key: 'open:hello' })).toBeUndefined()
    await ui.press({ key: 'open:session-files' })
    await ui.unmount()
  }
  expect(ran[0]).toBe('session-files')
})

test('no pane commands, nothing added', async ($, on) => {
  on('command.list', () => ({ value: COMMANDS.slice(2) }))
  const ui = await $.ui.mount({ ...LIST, surface: 'desktop' } as never)
  expect(await ui.find({ key: 'launchers' })).toBeUndefined()
  await ui.unmount()
})
