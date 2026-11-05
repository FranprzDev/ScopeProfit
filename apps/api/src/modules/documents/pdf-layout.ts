import PDFDocument from 'pdfkit';
import { renderDiagram, type DiagramRenderer } from './diagram';

export enum MarkdownBlockKind {
  Title = 'title',
  Section = 'section',
  Subsection = 'subsection',
  Meta = 'meta',
  Bullet = 'bullet',
  Paragraph = 'paragraph',
  Figure = 'figure',
}

export interface MarkdownBlock {
  kind: MarkdownBlockKind;
  text: string;
  title?: string;
}

export interface PdfPalette {
  accent: string;
  accentAlt: string;
  ink: string;
  muted: string;
  band: string;
  rule: string;
}

export interface PdfBrand {
  name: string;
  tagline: string;
}

const defaultPalette: PdfPalette = {
  accent: '#1d4ed8',
  accentAlt: '#1d4ed8',
  ink: '#111827',
  muted: '#4b5563',
  band: '#eff4ff',
  rule: '#d1d5db',
};

const hexColor = /^#[0-9a-fA-F]{6}$/;

export function exportPalette(): PdfPalette {
  const read = (name: string, fallback: string) => {
    const value = process.env[name];
    return value !== undefined && hexColor.test(value) ? value : fallback;
  };
  const accent = read('EXPORT_BRAND_ACCENT', defaultPalette.accent);
  return {
    accent,
    accentAlt: read('EXPORT_BRAND_ACCENT_ALT', accent),
    ink: read('EXPORT_BRAND_INK', defaultPalette.ink),
    muted: read('EXPORT_BRAND_MUTED', defaultPalette.muted),
    band: read('EXPORT_BRAND_BAND', defaultPalette.band),
    rule: read('EXPORT_BRAND_RULE', defaultPalette.rule),
  };
}

export function exportBrand(): PdfBrand {
  const name = process.env.EXPORT_BRAND_NAME?.trim();
  const tagline = process.env.EXPORT_BRAND_TAGLINE?.trim();
  return { name: name || 'ScopeProfit', tagline: tagline ?? '' };
}

const metaPattern = /^(Cliente|Fecha|Versión|Autor): (.*)$/;

const datePattern = /^(Fecha: )(\d{4})-(\d{2})-(\d{2})$/;
const timestampPattern = /^(Fecha: )(?:\d{4}-\d{2}-\d{2}T.*)$/;
const fence = '```';

const backgroundBase = '#f4f5f7';
const backgroundFacet = '#eceef1';
const interiorTop = 96;
const brandRuleWidth = 44;

const spanishMonths = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function readableDate(line: string): string {
  const day = datePattern.exec(line);
  if (day) return `${day[1]}${day[4]}/${day[3]}/${day[2]}`;
  if (!timestampPattern.test(line)) return line;
  const moment = new Date(line.slice('Fecha: '.length));
  if (Number.isNaN(moment.getTime())) return line;
  const iso = moment.toISOString();
  const utc = `Fecha: ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)} UTC`;
  const timeZone = process.env.EXPORT_TIMEZONE;
  if (!timeZone) return utc;
  try {
    const local = new Intl.DateTimeFormat('es', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(moment);
    return `Fecha: ${local}`;
  } catch {
    return utc;
  }
}

function monthYearLabel(month: number, year: number): string {
  return `${spanishMonths[month - 1] ?? ''} ${year}`.trim();
}

function timeZoneMonthYear(timeZone: string, date: Date): { month: number; year: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'numeric',
      year: 'numeric',
    }).formatToParts(date);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    return month >= 1 && month <= 12 && year > 0 ? { month, year } : null;
  } catch {
    return null;
  }
}

function coverDateLabel(metas: MarkdownBlock[]): string {
  const value = metas
    .map((block) => metaPattern.exec(block.text))
    .find((match) => match?.[1] === 'Fecha')?.[2];
  const dayMonthYear = value ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value) : null;
  if (dayMonthYear) return monthYearLabel(Number(dayMonthYear[2]), Number(dayMonthYear[3]));
  const iso = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (iso) return monthYearLabel(Number(iso[2]), Number(iso[1]));
  const now = new Date();
  const timeZone = process.env.EXPORT_TIMEZONE;
  const zoned = timeZone ? timeZoneMonthYear(timeZone, now) : null;
  return zoned
    ? monthYearLabel(zoned.month, zoned.year)
    : monthYearLabel(now.getMonth() + 1, now.getFullYear());
}

function extractCover(blocks: MarkdownBlock[]): {
  title: string;
  metas: MarkdownBlock[];
  body: MarkdownBlock[];
} {
  let title = '';
  const metas: MarkdownBlock[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    if (block.kind === MarkdownBlockKind.Title && title === '') {
      title = block.text;
      index += 1;
      continue;
    }
    if (block.kind === MarkdownBlockKind.Meta) {
      metas.push(block);
      index += 1;
      continue;
    }
    break;
  }
  return { title, metas, body: blocks.slice(index) };
}

export function parseMarkdown(md: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let figure: string[] | null = null;
  for (const line of md.split('\n')) {
    if (line.startsWith(fence)) {
      if (figure === null) {
        figure = [];
      } else {
        const last = blocks[blocks.length - 1];
        const title = last?.kind === MarkdownBlockKind.Subsection ? last.text : undefined;
        if (title !== undefined) blocks.pop();
        blocks.push({ kind: MarkdownBlockKind.Figure, text: figure.join('\n'), title });
        figure = null;
      }
      continue;
    }
    if (figure !== null) {
      figure.push(line);
      continue;
    }
    if (line.trim() === '') continue;
    if (line.startsWith('### '))
      blocks.push({ kind: MarkdownBlockKind.Subsection, text: line.slice(4) });
    else if (line.startsWith('## '))
      blocks.push({ kind: MarkdownBlockKind.Section, text: line.slice(3) });
    else if (line.startsWith('# '))
      blocks.push({ kind: MarkdownBlockKind.Title, text: line.slice(2) });
    else if (line.startsWith('- '))
      blocks.push({ kind: MarkdownBlockKind.Bullet, text: line.slice(2) });
    else if (metaPattern.test(line))
      blocks.push({ kind: MarkdownBlockKind.Meta, text: readableDate(line) });
    else blocks.push({ kind: MarkdownBlockKind.Paragraph, text: line });
  }
  return blocks;
}

function drawBackground(doc: PDFKit.PDFDocument): void {
  const width = doc.page.width;
  const height = doc.page.height;
  doc.save();
  doc.rect(0, 0, width, height).fill(backgroundBase);
  doc.polygon([0, 0], [width * 0.62, 0], [0, height * 0.46]).fill(backgroundFacet);
  doc.polygon([width, 0], [width, height * 0.34], [width * 0.7, 0]).fill(backgroundFacet);
  doc.polygon([0, height], [width * 0.5, height], [0, height * 0.58]).fill(backgroundFacet);
  doc
    .polygon([width, height * 0.52], [width, height], [width * 0.46, height])
    .fill(backgroundFacet);
  doc.restore();
}

function drawCornerBands(doc: PDFKit.PDFDocument, palette: PdfPalette, scale: number): void {
  const width = doc.page.width;
  const height = doc.page.height;
  const angle = (38 * Math.PI) / 180;
  const directionX = Math.cos(angle);
  const directionY = -Math.sin(angle);
  const normalX = Math.sin(angle);
  const normalY = Math.cos(angle);
  const centerX = width - 40 * scale;
  const centerY = height - 40 * scale;
  const length = width * 0.55 * scale;
  const bands = [
    { color: palette.accentAlt, thickness: 34 * scale, offset: 0 },
    { color: palette.ink, thickness: 16 * scale, offset: -26 * scale },
    { color: palette.accent, thickness: 9 * scale, offset: -46 * scale },
  ];
  doc.save();
  for (const band of bands) {
    const originX = centerX + normalX * band.offset;
    const originY = centerY + normalY * band.offset;
    const halfX = (directionX * length) / 2;
    const halfY = (directionY * length) / 2;
    const thickX = (normalX * band.thickness) / 2;
    const thickY = (normalY * band.thickness) / 2;
    doc
      .polygon(
        [originX - halfX - thickX, originY - halfY - thickY],
        [originX + halfX - thickX, originY + halfY - thickY],
        [originX + halfX + thickX, originY + halfY + thickY],
        [originX - halfX + thickX, originY - halfY + thickY],
      )
      .fill(band.color);
  }
  doc.restore();
}

function drawInteriorHeader(
  doc: PDFKit.PDFDocument,
  palette: PdfPalette,
  brand: PdfBrand,
  date: string,
): void {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  doc.save();
  doc
    .fillColor(palette.ink)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(brand.name, left, 48, { width: width / 2, lineBreak: false });
  doc
    .fillColor(palette.ink)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(date, left + width / 2, 48, { width: width / 2, align: 'right', lineBreak: false });
  doc.restore();
}

function drawCover(
  doc: PDFKit.PDFDocument,
  palette: PdfPalette,
  brand: PdfBrand,
  title: string,
  metas: MarkdownBlock[],
  date: string,
): void {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.right - left;
  drawBackground(doc);
  drawCornerBands(doc, palette, 1);
  doc.page.margins.top = 0;
  doc.page.margins.bottom = 0;
  doc.save();
  doc
    .fillColor(palette.accentAlt)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(brand.name, left, 48, { width: width / 2, lineBreak: false });
  doc
    .fillColor(palette.ink)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(date, left + width / 2, 48, { width: width / 2, align: 'right', lineBreak: false });
  if (title) {
    const titleWidth = doc.page.width * 0.8;
    const words = title.split(/\s+/).filter(Boolean);
    const split = Math.ceil(words.length / 2);
    const first = words.slice(0, split).join(' ');
    const second = words.slice(split).join(' ');
    doc.fillColor(palette.ink).font('Helvetica').fontSize(40);
    if (second) {
      doc.text(`${first} `, left, doc.page.height * 0.38, { width: titleWidth, continued: true });
      doc.font('Helvetica-Bold').text(second, { width: titleWidth });
    } else {
      doc.text(first, left, doc.page.height * 0.38, { width: titleWidth });
    }
  }
  let y = doc.page.height * 0.72;
  doc.fillColor(palette.ink).font('Helvetica-Bold').fontSize(16);
  doc.text(brand.name, left, y, { width: width * 0.55 });
  y = doc.y + 10;
  if (brand.tagline) {
    doc.fillColor(palette.accentAlt).font('Helvetica').fontSize(12);
    doc.text(brand.tagline, left, y, { width: width * 0.55 });
    y = doc.y + 16;
  }
  doc
    .moveTo(left, y)
    .lineTo(left + brandRuleWidth, y)
    .strokeColor(palette.accentAlt)
    .lineWidth(2)
    .stroke();
  y += 16;
  for (const meta of metas) {
    if (meta.text.startsWith('Fecha:')) continue;
    const match = metaPattern.exec(meta.text);
    doc.fillColor(palette.muted).font('Helvetica').fontSize(12);
    doc.text((match?.[1] ?? '').toUpperCase(), left, y, { width: width * 0.55, lineBreak: false });
    y += 15;
    doc.fillColor(palette.ink).font('Helvetica-Bold').fontSize(12);
    doc.text(match?.[2] ?? '', left, y, { width: width * 0.55 });
    y = doc.y + 10;
  }
  doc.restore();
  doc.x = left;
  doc.y = interiorTop;
}

export function renderStyledPdf(
  blocks: MarkdownBlock[],
  info: { title: string; author: string },
  diagram: DiagramRenderer = renderDiagram,
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
    const palette = exportPalette();
    const brand = exportBrand();
    const { title, metas, body } = extractCover(blocks);
    const date = coverDateLabel(metas);
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    const ensure = (height: number) => {
      if (doc.y + height > bottom()) doc.addPage();
    };
    const metasBuffer: MarkdownBlock[] = [];
    const flushMeta = () => {
      if (metasBuffer.length === 0) return;
      const cell = width / 2;
      const rows = Math.ceil(metasBuffer.length / 2);
      ensure(rows * 30 + 12);
      const top = doc.y;
      doc.rect(left, top, width, rows * 30 + 12).fill(palette.band);
      metasBuffer.forEach((block, index) => {
        const match = metaPattern.exec(block.text);
        const x = left + 14 + (index % 2) * cell;
        const y = top + 10 + Math.floor(index / 2) * 30;
        doc
          .fillColor(palette.muted)
          .font('Helvetica')
          .fontSize(12)
          .text((match?.[1] ?? '').toUpperCase(), x, y, { width: cell - 20, lineBreak: false });
        doc
          .fillColor(palette.ink)
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(match?.[2] ?? '', x, y + 13, { width: cell - 20, lineBreak: false });
      });
      doc.x = left;
      doc.y = top + rows * 30 + 26;
      metasBuffer.length = 0;
    };
    const bulletHeight = (text: string) => {
      const [lead, ...rest] = text.split(' | ');
      const leadHeight = doc
        .font('Helvetica')
        .fontSize(12)
        .heightOfString(lead ?? '', {
          width: width - 18,
          lineGap: 2,
        });
      const detailHeight = rest.length
        ? doc
            .font('Helvetica')
            .fontSize(12)
            .heightOfString(rest.join('  ·  '), {
              width: width - 18,
              lineGap: 2,
            })
        : 0;
      return leadHeight + detailHeight + 8;
    };
    doc.on('pageAdded', () => {
      drawBackground(doc);
      drawCornerBands(doc, palette, 0.7);
      drawInteriorHeader(doc, palette, brand, date);
      doc.page.margins.top = interiorTop;
      doc.x = left;
      doc.y = interiorTop;
    });
    drawCover(doc, palette, brand, title, metas, date);
    doc.addPage();
    for (const [index, block] of body.entries()) {
      if (block.kind === MarkdownBlockKind.Meta) {
        metasBuffer.push(block);
        continue;
      }
      flushMeta();
      doc.x = left;
      if (block.kind === MarkdownBlockKind.Section || block.kind === MarkdownBlockKind.Subsection) {
        const headingHeight = block.kind === MarkdownBlockKind.Section ? 60 : 40;
        const following = body[index + 1];
        if (following) {
          let followingHeight: number;
          if (following.kind === MarkdownBlockKind.Bullet) {
            followingHeight = bulletHeight(following.text);
          } else if (following.kind === MarkdownBlockKind.Title) {
            followingHeight = doc
              .font('Helvetica-Bold')
              .fontSize(26)
              .heightOfString(following.text, { width: width - 18 });
          } else if (following.kind === MarkdownBlockKind.Section) {
            followingHeight = doc
              .font('Helvetica-Bold')
              .fontSize(16)
              .heightOfString(following.text, { width });
          } else if (following.kind === MarkdownBlockKind.Subsection) {
            followingHeight = doc
              .font('Helvetica-Bold')
              .fontSize(13)
              .heightOfString(following.text, { width });
          } else if (following.kind === MarkdownBlockKind.Figure) {
            followingHeight = doc
              .font('Helvetica-Bold')
              .fontSize(12)
              .heightOfString(following.title ?? '', { width });
          } else {
            followingHeight = doc
              .font('Helvetica')
              .fontSize(12)
              .heightOfString(following.text, { width, lineGap: 3 });
          }
          const onePage = bottom() - doc.page.margins.top;
          ensure(Math.min(headingHeight + followingHeight, onePage));
        }
      }
      switch (block.kind) {
        case MarkdownBlockKind.Title:
          doc
            .fillColor(palette.ink)
            .font('Helvetica-Bold')
            .fontSize(26)
            .text(block.text, left, doc.y, { width });
          doc.x = left;
          doc.moveDown(0.8);
          break;
        case MarkdownBlockKind.Section:
          ensure(60);
          doc.moveDown(0.8);
          doc
            .fillColor(palette.accent)
            .font('Helvetica-Bold')
            .fontSize(16)
            .text(block.text, left, doc.y, { width });
          doc.moveDown(0.7);
          break;
        case MarkdownBlockKind.Subsection:
          ensure(40);
          doc.moveDown(0.3);
          doc
            .fillColor(palette.accentAlt)
            .font('Helvetica-Bold')
            .fontSize(13)
            .text(block.text, left, doc.y, { width });
          doc.moveDown(0.3);
          break;
        case MarkdownBlockKind.Bullet: {
          const [lead, ...rest] = block.text.split(' | ');
          ensure(bulletHeight(block.text));
          const top = doc.y;
          doc.circle(left + 5, top + 6, 2.2).fill(palette.accentAlt);
          doc
            .fillColor(palette.ink)
            .font('Helvetica')
            .fontSize(12)
            .text(lead ?? '', left + 18, top, { width: width - 18, lineGap: 2 });
          if (rest.length > 0)
            doc
              .fillColor(palette.muted)
              .font('Helvetica')
              .fontSize(12)
              .text(rest.join('  ·  '), left + 18, doc.y, { width: width - 18, lineGap: 2 });
          doc.x = left;
          doc.moveDown(0.5);
          break;
        }
        case MarkdownBlockKind.Figure: {
          const image = diagram(block.text);
          const maxHeight = bottom() - doc.page.margins.top - 40;
          const scale = Math.min(
            Math.min(width, image.naturalWidth) / image.width,
            maxHeight / image.height,
          );
          const drawWidth = image.width * scale;
          const drawHeight = image.height * scale;
          ensure(drawHeight + 36);
          if (block.title !== undefined)
            doc
              .fillColor(palette.ink)
              .font('Helvetica-Bold')
              .fontSize(12)
              .text(block.title, left, doc.y, { width });
          doc.moveDown(0.3);
          const top = doc.y;
          doc.image(image.png, left + (width - drawWidth) / 2, top, {
            width: drawWidth,
            height: drawHeight,
          });
          doc.x = left;
          doc.y = top + drawHeight + 20;
          break;
        }
        default:
          ensure(24);
          doc
            .fillColor(palette.ink)
            .font('Helvetica')
            .fontSize(12)
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
        .fontSize(12)
        .text(`${info.title}  ·  ${index + 1} / ${range.count}`, left, doc.page.height - 40, {
          width,
          align: 'center',
          lineBreak: false,
        });
    }
    doc.end();
  });
}
