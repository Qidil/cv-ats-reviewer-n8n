export function makePdf(content: string): Buffer {
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

// Phase 14: builder dengan beberapa font untuk test ekstraksi typography/layout.
export interface MakePdfOptions {
  fonts?: string[]
  page?: [number, number]
}

export function makePdfWith(content: string, options: MakePdfOptions = {}): Buffer {
  const fonts = options.fonts ?? ['Helvetica']
  const page = options.page ?? [612, 792]
  const fontRefs = fonts.map((_, i) => `/F${i + 1} ${5 + i} 0 R`).join(' ')
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page[0]} ${page[1]}] /Contents 4 0 R /Resources << /Font << ${fontRefs} >> >> >>`,
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    ...fonts.map((f) => `<< /Type /Font /Subtype /Type1 /BaseFont /${f} >>`),
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}