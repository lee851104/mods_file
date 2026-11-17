/** One file a round wrote or edited. */
export type RoundFile = {
  path: string
  kind: 'created' | 'edited'
  edits: number
}

/** One question-and-answer round of the conversation, with the files it touched. */
export type Round = {
  /** 1 for the first question of the conversation */
  n: number
  /** the person's question, tags stripped and cut short */
  prompt: string
  /** a tool_use_id in this round, to scroll the chat back to it */
  anchor?: string
  files: RoundFile[]
}

/** What the transcript says, rebuilt after every file change. */
export type Snapshot = {
  /** how many rounds the conversation has, files or not: "this round" is the last */
  total: number
  /** rounds that touched a file, oldest first */
  rounds: Round[]
}

/** A change seen live (a subagent's, or one not yet in the transcript), kept until the transcript holds it. */
export type Extra = { id: string; path: string; isNew: boolean; round: number }

/** What the last show-in-Explorer press is doing, drawn on that file's card. */
export type PressStatus = {
  path: string
  phase: 'busy' | 'done' | 'error'
  text: string
}

declare module 'claude-code' {
  interface PluginState {
    'session-files': {
      snapshot: Shaped<Snapshot>
      extras: Shaped<Extra[]>
      /** paths the person hid with ×; they stay hidden */
      hidden: Shaped<string[]>
      /** minor paths the person chose to keep showing */
      kept: Shaped<string[]>
      /** whether the hidden files are listed at the bottom */
      showHidden: Shaped<boolean>
      status: Shaped<PressStatus | null>
    }
  }
}
