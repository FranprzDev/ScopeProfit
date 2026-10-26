import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } from 'docx';
import { memoizedDiagramRenderer, renderDiagram, type DiagramRenderer } from './diagram';
import { MarkdownBlockKind, parseMarkdown, renderStyledPdf } from './pdf-layout';
import type { DocumentData, TiptapNode } from '@scopeprofit/contracts';

export function validateEditor(node: TiptapNode, depth = 0, count = { value: 0 }): void {
  const allowed = [
    'doc',
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'listItem',
    'table',
    'tableRow',
    'tableCell',
    'tableHeader',
    'text',
    'hardBreak',
  ];
  if (
    !node ||
    typeof node !== 'object' ||
    !allowed.includes(node.type) ||
    depth > 15 ||
    ++count.value > 10000 ||
    (node.text !== undefined && (typeof node.text !== 'string' || node.text.length > 100000)) ||
    (node.content !== undefined && !Array.isArray(node.content))
  )
    throw new Error('Invalid editor content');
  if (
    node.marks?.some(
      (mark) =>
        !['bold', 'italic', 'strike', 'underline', 'code'].includes(mark.type) ||
        mark.attrs !== undefined,
    )
  )
    throw new Error('Invalid editor marks');
  if (
    node.attrs &&
    Object.entries(node.attrs).some(
      ([key, value]) =>
        !['level', 'start', 'colspan', 'rowspan', 'colwidth'].includes(key) ||
        !(
          value === null ||
          (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100) ||
          (key === 'colwidth' &&
            Array.isArray(value) &&
            value.every((n) => typeof n === 'number' && n > 0 && n <= 10000))
        ),
    )
  )
    throw new Error('Invalid editor attributes');
  for (const child of node.content || []) validateEditor(child, depth + 1, count);
}
export function editorText(node: TiptapNode): string {
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  return (
    (node.content || [])
      .map(editorText)
      .join(
        ['doc', 'bulletList', 'orderedList', 'table', 'tableRow'].includes(node.type) ? '\n' : '',
      ) +
    (['paragraph', 'heading', 'listItem', 'tableCell', 'tableHeader'].includes(node.type)
      ? '\n'
      : '')
  );
}
function baseMarkdown(data: DocumentData) {
  const b = data.brief;
  const validity = b.quoteValidity;
  const expiresOn = validity
    ? new Date(Date.parse(validity.issuedOn) + validity.days * 86400000).toISOString().slice(0, 10)
    : null;
  const validitySection = validity
    ? `\n\n## 8. Vigencia del presupuesto\nVálido por ${validity.days} días corridos desde la fecha de emisión ${validity.issuedOn}, hasta ${expiresOn}.\nEl presupuesto depende de la disponibilidad del profesional y su carga de proyectos al momento de cotizar. Vencido ese plazo, se requiere una nueva cotización según la disponibilidad y carga de trabajo vigentes: el precio puede subir o bajar. No se aplica ningún cambio automático ni se modifican presupuestos ya aceptados.`
    : '';
  const bullet = (values: string[]) =>
    values.map((value) => `- ${value}`).join('\n') || '- Pendiente de definición';
  return `# ${data.projectName}\nCliente: ${data.clientName}\nFecha: ${data.date}\nVersión: 0.${data.version}\nAutor: ${data.author}\n\n## 1. Resumen ejecutivo\n${b.summary}\n\n## 2. Requerimientos identificados\n${b.requirements.map((r) => `- ${r.id} | ${r.description} | ${r.type} | ${r.priority} | Fuente: "${r.source}" | ${r.systemNote}`).join('\n')}\n\n## 3. Preguntas pendientes\n${b.questions.map((q) => `- ${q.id}: ${q.question} | ${q.reason} | Bloquea estimación: ${q.blocksEstimate ? 'Sí' : 'No'}`).join('\n') || 'Sin preguntas pendientes'}\n\n## 4. Riesgos y ambigüedades\n${b.risks.map((r) => `- ${r.id}: ${r.description} | Impacto: ${r.impact} | Mitigación/supuesto: ${r.mitigation} | Semáforo: ${r.severity}`).join('\n') || 'Sin riesgos identificados'}\n\n## 5. Alcance\n### Incluidos\n${bullet(b.included)}\n### Excluidos\n${bullet(b.excluded)}\n### Supuestos\n${bullet(b.assumptions)}\n### Criterios de aceptación\n${bullet(b.acceptanceCriteria)}\n\n## 6. Estimación orientativa en horas\n${b.estimates.map((e) => `- ${e.module}: ${e.minHours}–${e.maxHours} h | ${e.uncertainty}`).join('\n')}\nTotal: ${b.estimates.length > 0 ? `${b.estimates.reduce((n, e) => n + e.minHours, 0)}–${b.estimates.reduce((n, e) => n + e.maxHours, 0)} h` : 'Pendiente de estimación'}. Rango orientativo sujeto a los supuestos e incertidumbres indicados; no es un precio.\n\n## 7. Próximos pasos\n${bullet(b.nextSteps)}${validitySection}${data.editorContent ? `\n\n## Observaciones y edición manual\n${editorText(data.editorContent)}` : ''}\n`;
}
export function markdown(data: DocumentData) {
  const diagrams = data.brief.diagrams ?? [];
  const section = diagrams
    .map((d) => `### ${d.title}\n\`\`\`mermaid\n${d.source}\n\`\`\``)
    .join('\n\n');
  return baseMarkdown(data) + (section ? `\n## Diagramas\n${section}\n` : '');
}
export async function markdownToPdf(
  md: string,
  info: { title: string; author: string },
  diagram: DiagramRenderer = renderDiagram,
): Promise<Buffer> {
  return renderStyledPdf(parseMarkdown(md), info, diagram);
}
export async function markdownToDocx(
  md: string,
  diagram: DiagramRenderer = renderDiagram,
): Promise<Buffer> {
  const children = parseMarkdown(md).flatMap((block) => {
    const [lead, ...rest] = block.text.split(' | ');
    switch (block.kind) {
      case MarkdownBlockKind.Title:
        return new Paragraph({ heading: HeadingLevel.TITLE, text: block.text });
      case MarkdownBlockKind.Section:
        return new Paragraph({ heading: HeadingLevel.HEADING_1, text: block.text });
      case MarkdownBlockKind.Subsection:
        return new Paragraph({ heading: HeadingLevel.HEADING_2, text: block.text });
      case MarkdownBlockKind.Figure: {
        const image = diagram(block.text);
        const scale = Math.min(Math.min(600, image.naturalWidth) / image.width, 800 / image.height);
        const caption = new Paragraph({
          heading: HeadingLevel.HEADING_2,
          text: block.title ?? 'Diagrama',
        });
        const figure = new Paragraph({
          spacing: { before: 120, after: 200 },
          children: [
            new ImageRun({
              type: 'png',
              data: image.png,
              transformation: {
                width: Math.round(image.width * scale),
                height: Math.round(image.height * scale),
              },
              altText: {
                title: block.title ?? 'Diagrama',
                description: block.title ?? 'Diagrama',
                name: 'diagrama',
              },
            }),
          ],
        });
        return [caption, figure];
      }
      case MarkdownBlockKind.Bullet:
        return new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: lead ?? '', bold: rest.length > 0 }),
            ...(rest.length > 0 ? [new TextRun({ text: ` | ${rest.join(' | ')}` })] : []),
          ],
        });
      default:
        return new Paragraph({ spacing: { after: 120 }, children: [new TextRun(block.text)] });
    }
  });
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}
export async function render(data: DocumentData) {
  const md = markdown(data);
  const diagram = memoizedDiagramRenderer();
  const [pdf, docx] = await Promise.all([
    markdownToPdf(md, { title: data.projectName, author: data.author }, diagram),
    markdownToDocx(md, diagram),
  ]);
  return { md: Buffer.from(md), pdf, docx };
}
