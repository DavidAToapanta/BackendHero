// eslint-disable-next-line @typescript-eslint/no-require-imports -- PDFKit exporta la clase con CommonJS.
import PDFDocument = require('pdfkit');

export function archivoPdf(
  titulo: string,
  bloques: readonly { titulo?: string; lineas: readonly string[] }[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const documento = new PDFDocument({
      size: 'A4',
      margin: 44,
      info: { Title: titulo },
    });
    const partes: Buffer[] = [];
    documento.on('data', (parte: Buffer) => partes.push(parte));
    documento.on('error', reject);
    documento.on('end', () => resolve(Buffer.concat(partes)));
    documento.font('Helvetica-Bold').fontSize(18).text(titulo).moveDown();
    for (const bloque of bloques) {
      if (bloque.titulo)
        documento.font('Helvetica-Bold').fontSize(12).text(bloque.titulo);
      documento.font('Helvetica').fontSize(10);
      for (const linea of bloque.lineas)
        documento.text(linea, { paragraphGap: 4 });
      documento.moveDown();
    }
    documento.end();
  });
}
