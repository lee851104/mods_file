import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMessage } from 'claude-code'

import type { Extra, PressStatus, Round, RoundFile, Snapshot } from '../types'
import { SHOW_IN_EXPLORER, encodeForPowerShell } from './explorer'
import { CHECK, CROSS, SPINNER, fileIcon, roundBadge, roundBadgeWidth } from './icons'

const PANE = 'session-files'
const TITLE = '本次製作的檔案'

const snapshot = atom({ plugin: 'session-files', key: 'snapshot' } as const, { total: 0, rounds: [] } as Snapshot, {
  shape: 'snapshot-1',
})
const extras = atom({ plugin: 'session-files', key: 'extras' } as const, [] as Extra[], { shape: 'extras-1' })
const hidden = atom({ plugin: 'session-files', key: 'hidden' } as const, [] as string[], { shape: 'hidden-1' })
const kept = atom({ plugin: 'session-files', key: 'kept' } as const, [] as string[], { shape: 'kept-1' })
const showHidden = atom({ plugin: 'session-files', key: 'showHidden' } as const, false, { shape: 'showHidden-1' })
const status = atom({ plugin: 'session-files', key: 'status' } as const, null as PressStatus | null, { shape: 'status-3' })

// ------------------------------------------------------------------ paths

export function nameOf(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
}

export function folderOf(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')))
}

/**
 * Files nobody goes looking for: scratch and temp files, tests, logs, lock
 * files, caches and Claude's own memory notes. Hidden unless kept.
 */
export function isMinor(path: string): boolean {
  const p = path.replace(/\\/g, '/').toLowerCase()
  const name = nameOf(p)
  return (
    /\/(appdata\/local\/temp|tmp|temp|scratchpad|node_modules|\.git|__pycache__|\.cache|dist|build)\//.test(p) ||
    /\/\.claude\/(projects|plugins\/cache|file-history|todos|shell-snapshots)\//.test(p) ||
    /\.(test|spec)\.[a-z0-9]+$/.test(name) ||
    /\.(log|tmp|bak|lock|map)$/.test(name) ||
    /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|memory\.md|\.ds_store|thumbs\.db)$/.test(name)
  )
}

// ----------------------------------------------------- rounds from transcript

type Change = { id: string; path: string; isNew: boolean }

/** The file a Write, Edit or NotebookEdit call touches; undefined for any other tool. */
function pathOf(tool: string, input: Record<string, unknown>): string | undefined {
  const raw =
    tool === 'Write' || tool === 'Edit' ? input.file_path : tool === 'NotebookEdit' ? input.notebook_path : undefined
  return typeof raw === 'string' && raw !== '' ? raw : undefined
}

function isNewFile(tool: string, result: unknown, text: string | undefined): boolean {
  if (tool !== 'Write') return false
  const type = (result as { type?: unknown } | undefined)?.type
  return type === 'create' || (type === undefined && /created successfully/i.test(text ?? ''))
}

/**
 * A user message that is the person asking something starts a round; tool
 * results and the harness's own notices (which open with a tag) do not.
 */
export function promptOf(message: SessionMessage): string | undefined {
  if (message.role !== 'user' || (message.toolResults?.length ?? 0) > 0) return undefined
  let text = message.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
  const command = /<command-name>\s*\/?([^<]+?)\s*<\/command-name>/.exec(text)
  if (command) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim()
    return `/${command[1]}${args ? ` ${args}` : ''}`
  }
  if (text.startsWith('<')) return undefined
  text = text.replace(/\s+/g, ' ')
  return text === '' ? '（圖片或附件）' : text.length > 80 ? `${text.slice(0, 80)}…` : text
}

function touch(round: Round, change: Change): void {
  const old = round.files.find(f => f.path === change.path)
  const file: RoundFile = {
    path: change.path,
    kind: old?.kind === 'created' || change.isNew ? 'created' : 'edited',
    edits: (old?.edits ?? 0) + 1,
  }
  round.files = [file, ...round.files.filter(f => f.path !== change.path)]
}

/** Every round of the conversation and the files each touched, plus live changes the transcript lacks. */
export function buildSnapshot(messages: readonly SessionMessage[], live: readonly Extra[]): Snapshot {
  const rounds: Round[] = []
  let current: Round | undefined
  const known = new Set<string>()

  for (const message of messages) {
    const prompt = promptOf(message)
    if (prompt !== undefined) {
      current = { n: rounds.length + 1, prompt, files: [] }
      rounds.push(current)
      continue
    }
    for (const use of message.toolUses) {
      const path = pathOf(use.tool, use.input)
      if (path === undefined || use.isError || use.text === undefined) continue
      known.add(use.tool_use_id)
      if (current === undefined) {
        current = { n: 0, prompt: '（對話開始前）', files: [] }
        rounds.push(current)
      }
      current.anchor ??= use.tool_use_id
      touch(current, { id: use.tool_use_id, path, isNew: isNewFile(use.tool, use.result, use.text) })
    }
  }

  for (const extra of live) {
    if (known.has(extra.id)) continue
    let round = rounds.find(r => r.n === extra.round)
    if (round === undefined) {
      round = { n: extra.round, prompt: '', files: [] }
      rounds.push(round)
    }
    round.anchor ??= extra.id
    touch(round, extra)
  }

  const total = rounds.filter(r => r.n > 0).length
  return { total, rounds: rounds.filter(r => r.files.length > 0).sort((a, b) => a.n - b.n) }
}

/** Reads the transcript again; a change seen live joins it under the round it happened in. */
async function refresh($: EngineInterface, change?: Change): Promise<void> {
  const messages = await $.session.messages()
  if (change) {
    const round = messages.filter(m => promptOf(m) !== undefined).length
    await update($, extras, list => [...list.filter(x => x.id !== change.id), { ...change, round }].slice(-200))
  }
  const live = await read($, extras)
  const next = buildSnapshot(messages, live)
  await update($, snapshot, () => next)

  // Drop live changes the transcript now holds.
  const inTranscript = new Set(messages.flatMap(m => m.toolUses.filter(u => u.text !== undefined).map(u => u.tool_use_id)))
  if (live.some(x => inTranscript.has(x.id))) await update($, extras, list => list.filter(x => !inTranscript.has(x.id)))
}

// ------------------------------------------------------- show in Explorer

/** Puts the press's state on the file's card, and keeps a short log in the store to read back. */
async function report($: EngineInterface, next: PressStatus): Promise<void> {
  await update($, status, () => next).catch(() => undefined)
  try {
    const log = ((await $.store.get('log')) as string[] | undefined) ?? []
    await $.store.set('log', [...log, `${new Date().toISOString()} ${next.phase} ${next.text}`].slice(-20))
  } catch {
    // the log is a convenience only
  }
}

/** A finished press fades back to the plain button after a moment, unless another press replaced it. */
function settleLater($: EngineInterface, shown: PressStatus, ms: number): void {
  $.clock.after(ms, () => {
    void update($, status, now => (now?.path === shown.path && now.phase === shown.phase ? null : now))
  })
}

async function showInExplorer($: EngineInterface, path: string): Promise<void> {
  await report($, { path, phase: 'busy', text: '開啟中…' })

  let outcome: PressStatus
  if (!/^[A-Za-z]:[\\/]|^\\\\/.test(path)) {
    // Not a Windows path: macOS reveals with `open -R`, Linux opens the folder.
    const mac = await $.process.run(['open', '-R', path]).catch(() => undefined)
    if (mac?.exitCode !== 0) await $.process.run(['xdg-open', folderOf(path) || '.']).catch(() => undefined)
    outcome = { path, phase: 'done', text: '已在檔案管理員中顯示' }
  } else {
    try {
      const ran = await $.process.run(
        ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodeForPowerShell(SHOW_IN_EXPLORER)],
        { env: { SESSION_FILES_PATH: path.replace(/\//g, '\\') }, timeoutMs: 20000 },
      )
      outcome =
        ran.exitCode === 0
          ? { path, phase: 'done', text: '已在檔案總管中顯示' }
          : ran.exitCode === 3
            ? { path, phase: 'error', text: '找不到檔案，可能已被移動或刪除' }
            : ran.exitCode === 4
              ? { path, phase: 'error', text: '資料夾已開啟，但視窗在後面：請點工作列上的檔案總管' }
              : { path, phase: 'error', text: `開啟失敗（代碼 ${ran.exitCode}）${ran.stderr.trim().slice(0, 120)}` }
    } catch (err) {
      outcome = { path, phase: 'error', text: `開啟失敗：${(err instanceof Error ? err.message : String(err)).slice(0, 120)}` }
    }
  }

  await report($, outcome)
  settleLater($, outcome, outcome.phase === 'done' ? 2600 : 7000)
}

// ------------------------------------------------------------------- hooks

/** A short, stable name for a file's hover group (scopes are at most 64 characters). */
function scopeOf(path: string): string {
  let h = 2166136261
  for (let i = 0; i < path.length; i++) h = Math.imul(h ^ path.charCodeAt(i), 16777619)
  return `file-${(h >>> 0).toString(36)}`
}

function ago(n: number, total: number): string {
  const back = total - n
  return n === 0 ? '開始前' : back <= 0 ? '本輪' : back === 1 ? '上一輪' : `${back} 輪前`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'session-files', description: '🗂 開啟「檔案」面板：這個對話每一輪製作的檔案' })
    await refresh($).catch(() => undefined)
    void $.ui.open({ id: PANE, title: TITLE })
    return started
  })

  on('command.run', { command: 'session-files' }, async $ => {
    await refresh($).catch(() => undefined)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: '已開啟檔案面板。' }
  })

  on('tool.call', async ($, e, next) => {
    const path = pathOf(e.tool, e as unknown as Record<string, unknown>)
    const ran = await next(e)
    if (path === undefined || ('deny' in ran && ran.deny) || ran.isError) return ran
    // The list is bookkeeping: it must never fail the tool call itself.
    await refresh($, { id: e.tool_use_id, path, isNew: isNewFile(e.tool, ran.result, ran.text) }).catch(
      () => undefined,
    )
    return ran
  })


  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    // Svg draws on the desktop, the editor and the phone; the terminal's table
    // names it but draws nothing, so the terminal gets glyphs instead.
    const Svg = e.surface !== 'terminal' && 'Svg' in table && table.Svg ? table.Svg : undefined
    const { total, rounds } = await read($, snapshot)
    const press = await read($, status)
    const hiddenByHand = new Set(await read($, hidden))
    const keptByHand = new Set(await read($, kept))
    const isShowingHidden = await read($, showHidden)

    const isHidden = (path: string) => hiddenByHand.has(path) || (isMinor(path) && !keptByHand.has(path))
    const hide = (path: string) => {
      void update($, hidden, list => [...list.filter(p => p !== path), path])
      void update($, kept, list => list.filter(p => p !== path))
    }
    const unhide = (path: string) => {
      void update($, hidden, list => list.filter(p => p !== path))
      if (isMinor(path)) void update($, kept, list => [...list.filter(p => p !== path), path])
    }

    // Which rounds touched each file; the newest holds its full card.
    const roundsOf = new Map<string, number[]>()
    for (const r of rounds) for (const f of r.files) roundsOf.set(f.path, [...(roundsOf.get(f.path) ?? []), r.n])

    const svg = (source: string, alt: string, width: number, height: number, glyph: string, color: string) =>
      Svg ? (
        <Svg source={source} alt={alt} width={width} height={height} isInteractive />
      ) : (
        <Text color={color}>{glyph}</Text>
      )

    const newest = [...rounds].reverse().flatMap(r => r.files).find(f => !isHidden(f.path))?.path
    const hiddenCount = new Set(rounds.flatMap(r => r.files.map(f => f.path)).filter(isHidden)).size
    const shownRounds = [...rounds]
      .reverse()
      .map(r => ({ ...r, visible: r.files.filter(f => isShowingHidden || !isHidden(f.path)) }))
      .filter(r => r.visible.length > 0)

    const card = (round: Round, file: RoundFile) => {
      const name = nameOf(file.path)
      const id = `${round.n}:${file.path}`
      const seenIn = roundsOf.get(file.path) ?? []
      const latest = Math.max(...seenIn)

      // An earlier round's copy: one quiet line, ⤴ pointing at the round with its card.
      if (round.n !== latest) {
        return (
          <Box key={`card:${id}`} flexDirection="row" paddingX="sm">
            <Text size="caption" dimColor wrap="truncate-end" hover={{ scope: scopeOf(file.path), color: 'claude' }}>
              ↳ {name} ⤴{latest}
            </Text>
          </Box>
        )
      }

      const mine = press?.path === file.path ? press : null
      const isOff = isHidden(file.path)
      const earlier = seenIn.filter(n => n !== round.n)
      const tip = [
        file.path,
        `${file.kind === 'created' ? '新建' : '修改'}${file.edits > 1 ? ` ${file.edits} 次` : ''}`,
        earlier.length > 0 ? `也在 ${earlier.map(n => `#${n}`).join('、')} 改過` : '',
      ]
        .filter(Boolean)
        .join('\n')
      const isNewest = file.path === newest

      return (
        <Box key={`card:${id}`} flexDirection="column" gap="xs">
          <Box
            key={`row:${id}`}
            flexDirection="row"
            alignItems="center"
            gap="sm"
            paddingX="sm"
            paddingY="xs"
            borderStyle="round"
            borderColor={mine?.phase === 'error' ? 'error' : mine?.phase === 'done' ? 'success' : 'subtle'}
            // One hover group per file: pointing at it lights its lines in older rounds too.
            hover={{ scope: scopeOf(file.path), borderColor: 'claude' }}
          >
            {svg(
              fileIcon(name, { isLatest: isNewest, kind: file.kind, edits: file.edits, title: tip }),
              tip,
              30,
              32,
              file.kind === 'created' ? '+' : '~',
              file.kind === 'created' ? 'success' : 'warning',
            )}
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Text weight="semibold" wrap="truncate-middle" dimColor={isOff}>
                {name}
                {earlier.length > 0 ? <Text color="claude"> ↻</Text> : ''}
              </Text>
            </Box>
            {mine?.phase === 'busy' ? (
              svg(SPINNER, '開啟中', 22, 22, '…', 'claude')
            ) : mine?.phase === 'done' ? (
              svg(CHECK, '已在檔案總管中顯示', 22, 22, '✓', 'success')
            ) : (
              <Box flexDirection="row" alignItems="center" gap="xs">
                {mine?.phase === 'error' && svg(CROSS, mine.text, 22, 22, '✕', 'error')}
                <Button
                  key={`show:${id}`}
                  label={mine?.phase === 'error' ? '↻' : '📂'}
                  plain
                  hover={{ color: 'claude' }}
                  onPress={() => void showInExplorer($, file.path)}
                />
                {isOff ? (
                  <Button key={`unhide:${id}`} label="↺" plain dimColor hover={{ color: 'claude' }} onPress={() => unhide(file.path)} />
                ) : (
                  <Button key={`hide:${id}`} label="×" plain dimColor hover={{ color: 'error' }} onPress={() => hide(file.path)} />
                )}
              </Box>
            )}
          </Box>
          {mine?.phase === 'error' && (
            <Text size="caption" color="error" wrap="truncate-end">
              {mine.text}
            </Text>
          )}
        </Box>
      )
    }

    const toggle =
      hiddenCount > 0 ? (
        <Box key="toggle" flexDirection="row" justifyContent="center" paddingTop="xs">
          <Button
            key="toggle-hidden"
            label={isShowingHidden ? '◡' : `👁 ${hiddenCount}`}
            plain
            dimColor
            hover={{ color: 'claude' }}
            onPress={() => void update($, showHidden, v => !v)}
          />
        </Box>
      ) : null

    if (shownRounds.length === 0) {
      return (
        <Box flexDirection="column" alignItems="center" paddingY="xl" gap="sm">
          {svg(fileIcon(''), '還沒有檔案', 30, 32, '·', 'inactive')}
          <Text dimColor size="footnote">
            還沒有檔案
          </Text>
          {toggle}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap="md" paddingX="xs">
        {shownRounds.map(round => {
          const when = ago(round.n, total)
          const title = `${round.n === 0 ? '對話開始前' : `第 ${round.n} 輪（${when}）`}${round.prompt ? `\n「${round.prompt}」` : ''}`
          return (
            <Box key={`round:${round.n}`} flexDirection="column" gap="xs">
              {Svg ? (
                <Svg
                  source={roundBadge(round.n, when === '本輪', title)}
                  alt={title}
                  width={roundBadgeWidth(round.n)}
                  height={18}
                  isInteractive
                />
              ) : (
                <Text color="claude" weight="semibold">
                  {`#${round.n} `}
                  <Text dimColor>{when}</Text>
                </Text>
              )}
              {round.visible.map(file => card(round, file))}
            </Box>
          )
        })}
        {toggle}
      </Box>
    )
  })
}
