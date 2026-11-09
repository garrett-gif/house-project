/**
 * A room label that fits its room on the plan: the short name (up to the first comma or parenthesis), wrapped onto
 * up to two lines and sized so the longest line fits the room's width. Very small rooms get no label; their full
 * name shows on hover. Sizes are in plan feet.
 */
export function planLabel(name: string, w: number, d: number): { lines: string[]; size: number; showSize: boolean } | null {
  const short = name.split(/,| \(/)[0].trim()
  const words = short.split(' ')
  const options = [[short]]
  for (let k = 1; k < words.length; k++) options.push([words.slice(0, k).join(' '), words.slice(k).join(' ')])
  // Helvetica-ish text averages about 0.55 of its size per character.
  const fit = (lines: string[]) => Math.min(1.9, (w * 0.86) / (Math.max(...lines.map(l => l.length)) * 0.55), (d * 0.7) / (lines.length * 1.25 + 0.75))
  const best = options.map(lines => ({ lines, size: fit(lines) })).sort((a, b) => b.size - a.size || a.lines.length - b.lines.length)[0]
  if (best.size < 0.8) return null
  return { lines: best.lines, size: best.size, showSize: d >= 10 && w >= 10 && best.size >= 1.2 }
}
