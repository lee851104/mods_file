import type { CommandInfo, Register } from 'claude-code'

// A plugin command counts as a pane launcher when its description says it
// opens a panel: "面板", "pane" or "panel". New mods that follow that wording
// show up here by themselves, no edit needed.
const PANE_WORDS = /面板|\bpanes?\b|\bpanels?\b/i
const SELF = 'pane-launcher'

function isPaneCommand(c: CommandInfo): boolean {
  return c.source === 'plugin' && c.plugin !== SELF && PANE_WORDS.test(c.description)
}

// The button is the icon a description starts with (🗂 開啟「檔案」面板…);
// without one, ▤ and the part inside 「」, or the command name.
export function labelOf(c: CommandInfo): string {
  const icon = /^\s*(\p{Extended_Pictographic}️?)/u.exec(c.description)
  if (icon?.[1]) return icon[1]
  const quoted = /「([^」]+)」/.exec(c.description)
  return `▤ ${quoted?.[1] ?? c.name}`
}

export const register: Register = on => {
  // No row of its own: the launchers sit in a slim column at the right edge
  // of the band, beside whatever rows other mods draw (the usage meters), so
  // the band grows no taller.
  on('ui.render', { component: 'AbovePromptList' }, async ($, e, next) => {
    const band = await next(e)
    if (e.props.hasSurvey) return band

    const panes = (await $.command.list()).filter(isPaneCommand)
    if (panes.length === 0) return band

    const { Box, Button } = $.ui.resolve(e)
    const open = (c: CommandInfo) => {
      $.command.run({ command: c.name }).catch(() => $.ui.toast(`無法開啟 /${c.name}`))
    }

    return (
      <Box flexDirection="row" alignItems="center" gap="sm">
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          {band}
        </Box>
        <Box key="launchers" flexDirection="column" alignItems="flex-end" flexShrink={0} gap="xs">
          {panes.map(c => (
            <Button
              key={`open:${c.name}`}
              label={labelOf(c)}
              plain
              dimColor
              hover={{ color: 'claude', bold: true }}
              onPress={() => open(c)}
            />
          ))}
        </Box>
      </Box>
    )
  })
}
