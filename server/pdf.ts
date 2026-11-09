import PDFDocument from 'pdfkit'
import type { Mark, Sheet } from '../src/drawings/sheet'

/** Renders sheets to one PDF, page for page and mark for mark, at true scale. */
export function sheetsToPdf(sheets: Sheet[], title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      margin: 0,
      info: { Title: title, Author: 'House Project', Subject: 'Draft drawings. Not for construction until reviewed by a qualified person.' },
    })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    for (const sheet of sheets) {
      doc.addPage({ size: [sheet.width, sheet.height], margin: 0 })
      for (const m of sheet.marks) draw(doc, m)
    }
    doc.end()
  })
}

function dash(doc: PDFKit.PDFDocument, pattern?: number[]) {
  if (pattern?.length) doc.dash(pattern[0], { space: pattern[1] ?? pattern[0] })
  else doc.undash()
}

function draw(doc: PDFKit.PDFDocument, m: Mark) {
  doc.save()
  switch (m.t) {
    case 'line':
      dash(doc, m.dash)
      doc.lineWidth(m.w).strokeColor('#000').moveTo(m.x1, m.y1).lineTo(m.x2, m.y2).stroke()
      break
    case 'rect':
    case 'path': {
      dash(doc, m.dash)
      if (m.sw) doc.lineWidth(m.sw)
      if (m.t === 'rect') doc.rect(m.x, m.y, m.w, m.h)
      else doc.path(m.d)
      if (m.fill && m.stroke) doc.fillAndStroke(m.fill, m.stroke)
      else if (m.fill) doc.fill(m.fill)
      else if (m.stroke) doc.stroke(m.stroke)
      break
    }
    case 'text': {
      doc.font(m.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(m.size).fillColor('#000')
      const width = doc.widthOfString(m.text)
      const x = m.anchor === 'middle' ? m.x - width / 2 : m.anchor === 'end' ? m.x - width : m.x
      // Marks give the text baseline; PDFKit places text by its top.
      doc.text(m.text, x, m.y - m.size * 0.78, { lineBreak: false })
      break
    }
  }
  doc.restore()
}
