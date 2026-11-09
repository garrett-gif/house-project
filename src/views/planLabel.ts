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

/**
 * A site plan label that fits the space over its building or utility: the full name if it fits, else the name up
 * to the first comma or "and", else its last two words (so "Forestry fleet barn" reads "fleet barn"), else its
 * first word, else nothing (the name shows on hover).
 */
export function fitLabel(name: string, room: number, fontSize: number): string {
  const fits = (t: string) => t.length * fontSize * 0.55 <= room
  const words = name.split(/,| and | \(/)[0].trim().split(' ')
  const lastTwo = words.slice(-2).join(' ')
  const options = [name, words.join(' '), lastTwo.charAt(0).toUpperCase() + lastTwo.slice(1), words[0]]
  return options.find(fits) ?? ''
}

/**
 * Labels for a crowded map: larger buildings are labeled first, each with the longest form of its name that does not
 * collide with a label already placed. A name with no room is left off; it still shows on hover.
 */
export function placeLabels(items: { id: string; name: string; cx: number; y: number; below?: number; size: number }[], fontSize: number): Map<string, { text: string; y: number }> {
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  const out = new Map<string, { text: string; y: number }>()
  for (const it of [...items].sort((a, b) => b.size - a.size)) {
    const words = it.name.split(/,| and | \(/)[0].trim().split(' ')
    const lastTwo = words.slice(-2).join(' ')
    const options = [...new Set([it.name, words.join(' '), lastTwo.charAt(0).toUpperCase() + lastTwo.slice(1), words[0]])]
    // Above the building first, then below it.
    const spots = [it.y, ...(it.below !== undefined ? [it.below] : [])]
    search: for (const text of options) for (const y of spots) {
      const half = text.length * fontSize * 0.55 / 2
      const box = { x0: it.cx - half, x1: it.cx + half, y0: y - fontSize, y1: y + fontSize * 0.2 }
      if (placed.some(p => box.x0 < p.x1 && p.x0 < box.x1 && box.y0 < p.y1 && p.y0 < box.y1)) continue
      placed.push(box)
      out.set(it.id, { text, y })
      break search
    }
  }
  return out
}
