// Small animated SVG icons for the pane. They are drawn in a sandboxed frame
// (no script), so all motion is SMIL; colours are fixed mid-tones that read on
// both light and dark backgrounds.

const ACCENT = '#D97757'
const SUCCESS = '#3FB27F'
const ERROR = '#E5534B'

const TYPE_COLORS: Record<string, string> = {
  html: '#E8743B',
  htm: '#E8743B',
  css: '#8B6CF0',
  js: '#E3B341',
  jsx: '#E3B341',
  mjs: '#E3B341',
  ts: '#3B82F6',
  tsx: '#3B82F6',
  json: '#9AA4B2',
  md: '#5FA8E8',
  txt: '#9AA4B2',
  py: '#3FB27F',
  ipynb: '#F2994A',
  svg: '#F06EA9',
  png: '#F06EA9',
  jpg: '#F06EA9',
  yml: '#C678DD',
  yaml: '#C678DD',
  ps1: '#5FA8E8',
  sh: '#3FB27F',
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, c => `&#${c.charCodeAt(0)};`)
}

export type FileIconOptions = {
  /** a pulsing dot: the file changed most recently */
  isLatest?: boolean
  /** a corner badge: green + for a new file, amber pencil (or the count) for edits */
  kind?: 'created' | 'edited'
  edits?: number
  /** the tooltip shown on hover */
  title?: string
}

function cornerBadge(kind: FileIconOptions['kind'], edits: number): string {
  if (kind === 'created') {
    return `<circle cx="26" cy="28" r="5.5" fill="${SUCCESS}"/>
  <path d="M26 25.2v5.6M23.2 28h5.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`
  }
  if (kind === 'edited') {
    const inner =
      edits > 1
        ? `<text x="26" y="30.4" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif" font-size="7" font-weight="700" fill="#fff">${Math.min(edits, 99)}</text>`
        : `<path d="M23.8 30.2l.5-2 3.4-3.4 1.5 1.5-3.4 3.4z" fill="#fff"/>`
    return `<circle cx="26" cy="28" r="5.5" fill="#D9A23B"/>
  ${inner}`
  }
  return ''
}

/**
 * A document with a folded corner, tinted by file type, its extension on a
 * badge, with optional corner badge, pulsing dot and tooltip.
 */
export function fileIcon(name: string, options: FileIconOptions = {}): string {
  const { isLatest = false, kind, edits = 1, title } = options
  const ext = extOf(name)
  const color = TYPE_COLORS[ext] ?? '#8A94A6'
  const label = escapeXml((ext || 'file').slice(0, 4).toUpperCase())
  const tip = title ? `<title>${escapeXml(title)}</title>` : ''
  const dot = isLatest
    ? `<circle cx="27" cy="5" r="3.2" fill="${ACCENT}">
         <animate attributeName="r" values="2.6;3.6;2.6" dur="1.6s" repeatCount="indefinite"/>
       </circle>
       <circle cx="27" cy="5" r="3" fill="none" stroke="${ACCENT}" stroke-width="1.2">
         <animate attributeName="r" values="3;7" dur="1.6s" repeatCount="indefinite"/>
         <animate attributeName="opacity" values="0.8;0" dur="1.6s" repeatCount="indefinite"/>
       </circle>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="34" viewBox="0 0 32 34">
  ${tip}
  <rect width="32" height="34" fill="transparent"/>
  <path d="M5 3.5h13l7 7V29a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 3 29V6a2.5 2.5 0 0 1 2-2.5z"
        fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M18 3.5v5.5a1.5 1.5 0 0 0 1.5 1.5H25" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round"/>
  <rect x="1" y="12.5" width="${Math.max(16, label.length * 5.4 + 5)}" height="10" rx="2.5" fill="${color}"/>
  <text x="${Math.max(16, label.length * 5.4 + 5) / 2 + 1}" y="20.1" text-anchor="middle"
        font-family="Segoe UI, system-ui, sans-serif" font-size="7" font-weight="700" fill="#fff">${label}</text>
  ${cornerBadge(kind, edits)}
  ${dot}
</svg>`
}

/**
 * A round's number on a pill: filled for the current round, outlined for
 * earlier ones. The tooltip carries what the round asked.
 */
export function roundBadge(n: number, isCurrent: boolean, title: string): string {
  const text = n === 0 ? '0' : `#${n}`
  const width = Math.max(26, text.length * 7 + 12)
  const fill = isCurrent ? ACCENT : 'none'
  const ink = isCurrent ? '#fff' : ACCENT
  const pulse = isCurrent
    ? `<animate attributeName="opacity" values="1;0.75;1" dur="2.4s" repeatCount="indefinite"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="18" viewBox="0 0 ${width} 18">
  <title>${escapeXml(title)}</title>
  <rect x="0.75" y="0.75" width="${width - 1.5}" height="16.5" rx="8.25" fill="${fill}" stroke="${ACCENT}" stroke-width="1.5">${pulse}</rect>
  <text x="${width / 2}" y="12.6" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif"
        font-size="10.5" font-weight="700" fill="${ink}">${text}</text>
</svg>`
}

/** Width of a round badge, for the Svg element's box. */
export function roundBadgeWidth(n: number): number {
  const text = n === 0 ? '0' : `#${n}`
  return Math.max(26, text.length * 7 + 12)
}

/** A ring whose arc spins: the open is under way. */
export const SPINNER = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <circle cx="11" cy="11" r="8" fill="none" stroke="${ACCENT}" stroke-opacity="0.2" stroke-width="2.4"/>
  <circle cx="11" cy="11" r="8" fill="none" stroke="${ACCENT}" stroke-width="2.4" stroke-linecap="round"
          stroke-dasharray="14 40">
    <animateTransform attributeName="transform" type="rotate" from="0 11 11" to="360 11 11"
                      dur="0.8s" repeatCount="indefinite"/>
  </circle>
</svg>`

/** A circle that pops in, then a check mark that draws itself. */
export const CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <circle cx="11" cy="11" r="0" fill="${SUCCESS}">
    <animate attributeName="r" values="0;10.5;9.5" keyTimes="0;0.7;1" dur="0.35s" fill="freeze"/>
  </circle>
  <path d="M6.5 11.4l3 3 6-6.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"
        stroke-linejoin="round" stroke-dasharray="14" stroke-dashoffset="14">
    <animate attributeName="stroke-dashoffset" from="14" to="0" begin="0.25s" dur="0.3s" fill="freeze"/>
  </path>
</svg>`

/** A cross that shakes once: the open failed. */
export const CROSS = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
  <g>
    <animateTransform attributeName="transform" type="translate" values="0 0;-2 0;2 0;-1 0;0 0" dur="0.4s" fill="freeze"/>
    <circle cx="11" cy="11" r="9.5" fill="${ERROR}"/>
    <path d="M7.5 7.5l7 7M14.5 7.5l-7 7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
  </g>
</svg>`
