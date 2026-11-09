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
