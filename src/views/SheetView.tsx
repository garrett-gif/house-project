import type { Mark, Sheet } from '../drawings/sheet'

/** Draws a sheet exactly as the PDF will, on white paper. */
export function SheetView({ sheet }: { sheet: Sheet }) {
  return (
    <div className="plan">
      <svg className="sheet" viewBox={`0 0 ${sheet.width} ${sheet.height}`} role="img" aria-label={`Sheet ${sheet.number}, ${sheet.title}`}>
        <rect x={0} y={0} width={sheet.width} height={sheet.height} fill="#fff" />
        {sheet.marks.map((m, i) => <MarkView key={i} m={m} />)}
      </svg>
    </div>
  )
}

function MarkView({ m }: { m: Mark }) {
  switch (m.t) {
    case 'line': return <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke="#000" strokeWidth={m.w} strokeDasharray={m.dash?.join(' ')} />
    case 'rect': return <rect x={m.x} y={m.y} width={m.w} height={m.h} fill={m.fill ?? 'none'} stroke={m.stroke} strokeWidth={m.sw} strokeDasharray={m.dash?.join(' ')} />
    case 'path': return <path d={m.d} fill={m.fill ?? 'none'} stroke={m.stroke} strokeWidth={m.sw} strokeDasharray={m.dash?.join(' ')} />
    case 'text': return (
      <text x={m.x} y={m.y} fontSize={m.size} fontWeight={m.bold ? 700 : 400} textAnchor={m.anchor ?? 'start'} fontFamily="Helvetica, Arial, sans-serif" fill="#000">{m.text}</text>
    )
  }
}
