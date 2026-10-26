import PDFDocument from 'pdfkit';

export enum MarkdownBlockKind {
  Title = 'title',
  Section = 'section',
  Subsection = 'subsection',
  Meta = 'meta',
  Bullet = 'bullet',
  Paragraph = 'paragraph',
}

export interface MarkdownBlock {
  kind: MarkdownBlockKind;
  text: string;
}

const palette = {
  accent: '#1d4ed8',
  ink: '#111827',
  muted: '#4b5563',
  band: '#eff4ff',
  rule: '#d1d5db',
};

const metaPattern = /^(Cliente|Fecha|Versión|Autor): (.*)$/;

export function parseMarkdown(md: string): MarkdownBlock[] {
  return md
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      if (line.startsWith('### '))
        return { kind: MarkdownBlockKind.Subsection, text: line.slice(4) };
      if (line.startsWith('## ')) return { kind: MarkdownBlockKind.Section, text: line.slice(3) };
      if (line.startsWith('# ')) return { kind: MarkdownBlockKind.Title, text: line.slice(2) };
      if (line.startsWith('- ')) return { kind: MarkdownBlockKind.Bullet, text: line.slice(2) };
      if (metaPattern.test(line)) return { kind: MarkdownBlockKind.Meta, text: line };
      return { kind: MarkdownBlockKind.Paragraph, text: line };
    });
}

export function renderStyledPdf(
  blocks: MarkdownBlock[],
  info: { title: string; author: string },
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 56,
      bufferPages: true,
      info: { Title: info.title, Author: info.author },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    const ensure = (height: number) => {
      if (doc.y + height > bottom()) doc.addPage();
    };
    const metas: MarkdownBlock[] = [];
    const flushMeta = () => {
      if (metas.length === 0) return;
      const cell = width / 2;
      const rows = Math.ceil(metas.length / 2);
      ensure(rows * 22 + 12);
      const top = doc.y;
      doc.rect(left, top, width, rows * 22 + 12).fill(palette.band);
      metas.forEach((block, index) => {
        const match = metaPattern.exec(block.text);
        const x = left + 14 + (index % 2) * cell;
        const y = top + 10 + Math.floor(index / 2) * 22;
        doc
          .fillColor(palette.muted)
          .font('Helvetica')
          .fontSize(8)
          .text((match?.[1] ?? '').toUpperCase(), x, y, { width: cell - 20, lineBreak: false });
        doc
          .fillColor(palette.ink)
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(match?.[2] ?? '', x, y + 9, { width: cell - 20, lineBreak: false });
      });
      doc.x = left;
      doc.y = top + rows * 22 + 24;
      metas.length = 0;
    };
    for (const block of blocks) {
      if (block.kind === MarkdownBlockKind.Meta) {
        metas.push(block);
        continue;
      }
      flushMeta();
      doc.x = left;
      switch (block.kind) {
        case MarkdownBlockKind.Title:
          doc.rect(left, doc.y, 6, 34).fill(palette.accent);
          doc
            .fillColor(palette.ink)
            .font('Helvetica-Bold')
            .fontSize(24)
            .text(block.text, left + 18, doc.y + 4, { width: width - 18 });
          doc.x = left;
          doc.moveDown(0.8);
          break;
        case MarkdownBlockKind.Section:
          ensure(60);
          doc.moveDown(0.8);
          doc
            .fillColor(palette.accent)
            .font('Helvetica-Bold')
            .fontSize(14)
            .text(block.text, left, doc.y, { width });
          doc
            .moveTo(left, doc.y + 3)
            .lineTo(left + width, doc.y + 3)
            .strokeColor(palette.rule)
            .lineWidth(0.8)
            .stroke();
          doc.moveDown(0.7);
          break;
        case MarkdownBlockKind.Subsection:
          ensure(40);
          doc.moveDown(0.3);
          doc
            .fillColor(palette.ink)
            .font('Helvetica-Bold')
            .fontSize(11)
            .text(block.text, left, doc.y, { width });
          doc.moveDown(0.3);
          break;
        case MarkdownBlockKind.Bullet: {
          const [lead, ...rest] = block.text.split(' | ');
          ensure(rest.length > 0 ? 52 : 24);
          const top = doc.y;
          doc.circle(left + 5, top + 6, 2.2).fill(palette.accent);
          doc
            .fillColor(palette.ink)
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(lead ?? '', left + 18, top, { width: width - 18, lineGap: 2 });
          if (rest.length > 0)
            doc
              .fillColor(palette.muted)
              .font('Helvetica')
              .fontSize(9)
              .text(rest.join('  ·  '), left + 18, doc.y, { width: width - 18, lineGap: 2 });
          doc.x = left;
          doc.moveDown(0.5);
          break;
        }
        default:
          ensure(24);
          doc
            .fillColor(palette.ink)
            .font('Helvetica')
            .fontSize(10)
            .text(block.text, left, doc.y, { width, lineGap: 3 });
          doc.moveDown(0.5);
      }
    }
    flushMeta();
    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index++) {
      doc.switchToPage(range.start + index);
      doc.page.margins.bottom = 0;
      doc
        .fillColor(palette.muted)
        .font('Helvetica')
        .fontSize(8)
        .text(`${info.title}  ·  ${index + 1} / ${range.count}`, left, doc.page.height - 40, {
          width,
          align: 'center',
          lineBreak: false,
        });
    }
    doc.end();
  });
}
