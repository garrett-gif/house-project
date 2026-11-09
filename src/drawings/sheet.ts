/**
 * A drawing sheet is a list of simple marks in sheet points (1/72 inch), origin at the top-left corner.
 * Sheets are derived from the shared model on demand and never stored. The same marks render to SVG for the
 * preview and to PDF on the server, so the two cannot disagree.
 */
export type Mark =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; dash?: number[] }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; dash?: number[] }
  | { t: 'path'; d: string; fill?: string; stroke?: string; sw?: number; dash?: number[] }
  | { t: 'text'; x: number; y: number; text: string; size: number; anchor?: 'start' | 'middle' | 'end'; bold?: boolean }

export interface Sheet { number: string; title: string; width: number; height: number; marks: Mark[] }

export const PT_PER_IN = 72
/** ARCH D, landscape. */
export const ARCH_D = { width: 36 * PT_PER_IN, height: 24 * PT_PER_IN }

/** Feet and inches the way drawings write them: 20'-0", 3'-6". */
export function ftIn(inches: number) {
  const sign = inches < 0 ? '-' : ''
  const total = Math.round(Math.abs(inches) * 4) / 4
  let f = Math.floor(total / 12), i = total - f * 12
  if (i >= 12) { f += 1; i -= 12 }
  const frac = i % 1 ? ` ${i % 1 === 0.5 ? '1/2' : i % 1 === 0.25 ? '1/4' : '3/4'}` : ''
  return `${sign}${f}'-${Math.floor(i)}${frac}"`
}

/**
 * Marks moved by a rigid turn in sheet space (a rotation and a shift, no mirror). Rectangles become closed paths;
 * text keeps reading upright at its moved anchor. Paths may use M, L, A, and Z; arcs here are circular, so only their
 * end points move.
 */
export function turnMarks(marks: Mark[], f: (x: number, y: number) => [number, number]): Mark[] {
  const pt = (x: number, y: number) => f(x, y).map(v => Math.round(v * 100) / 100).join(' ')
  return marks.map((m): Mark => {
    switch (m.t) {
      case 'line': { const [x1, y1] = f(m.x1, m.y1), [x2, y2] = f(m.x2, m.y2); return { ...m, x1, y1, x2, y2 } }
      case 'text': { const [x, y] = f(m.x, m.y); return { ...m, x, y } }
      case 'rect': {
        const { x, y, w, h, t: _t, ...style } = m
        return { t: 'path', d: `M ${pt(x, y)} L ${pt(x + w, y)} L ${pt(x + w, y + h)} L ${pt(x, y + h)} Z`, ...style }
      }
      case 'path': {
        const tok = m.d.trim().split(/[\s,]+/), out: string[] = []
        for (let i = 0; i < tok.length;) {
          const c = tok[i++]
          if (c === 'M' || c === 'L') { out.push(c, pt(+tok[i], +tok[i + 1])); i += 2 }
          else if (c === 'A') { out.push('A', tok[i], tok[i + 1], tok[i + 2], tok[i + 3], tok[i + 4], pt(+tok[i + 5], +tok[i + 6])); i += 7 }
          else if (c === 'Z') out.push('Z')
          else { out.push('L', pt(+c, +tok[i])); i += 1 } // implicit L after M
        }
        return { ...m, d: out.join(' ') }
      }
    }
  })
}
