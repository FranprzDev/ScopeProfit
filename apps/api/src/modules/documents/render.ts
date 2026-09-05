import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import type { DocumentData, TiptapNode } from '@scopeprofit/contracts';

export function validateEditor(node: TiptapNode, depth=0, count={value:0}): void {
  const allowed=['doc','paragraph','heading','bulletList','orderedList','listItem','table','tableRow','tableCell','tableHeader','text','hardBreak'];
  if (!node || typeof node!=='object' || !allowed.includes(node.type) || depth>15 || ++count.value>10000 || (node.text!==undefined && (typeof node.text!=='string' || node.text.length>100000)) || (node.content!==undefined && !Array.isArray(node.content))) throw new Error('Invalid editor content');
  if (node.marks?.some(mark=>!['bold','italic','strike','underline','code'].includes(mark.type) || mark.attrs!==undefined)) throw new Error('Invalid editor marks');
  if (node.attrs && Object.entries(node.attrs).some(([key,value])=>!['level','start','colspan','rowspan','colwidth'].includes(key) || !(value===null || (typeof value==='number' && Number.isInteger(value) && value>=1 && value<=100) || (key==='colwidth' && Array.isArray(value) && value.every(n=>typeof n==='number' && n>0 && n<=10000))))) throw new Error('Invalid editor attributes');
  for (const child of node.content || []) validateEditor(child,depth+1,count);
}
export function editorText(node:TiptapNode):string {
  if(node.type==='text') return node.text || '';
  if(node.type==='hardBreak') return '\n';
  return (node.content || []).map(editorText).join(['doc','bulletList','orderedList','table','tableRow'].includes(node.type)?'\n':'')+(['paragraph','heading','listItem','tableCell','tableHeader'].includes(node.type)?'\n':'');
}
export function markdown(data:DocumentData) {
  const b=data.brief;
  const bullet=(values:string[])=>values.map(value=>`- ${value}`).join('\n') || '- Pendiente de definición';
  return `# ${data.projectName}\nCliente: ${data.clientName}\nFecha: ${data.date}\nVersión: 0.${data.version}\nAutor: ${data.author}\n\n## 1. Resumen ejecutivo\n${b.summary}\n\n## 2. Requerimientos identificados\n${b.requirements.map(r=>`- ${r.id} | ${r.description} | ${r.type} | ${r.priority} | Fuente: "${r.source}" | ${r.systemNote}`).join('\n')}\n\n## 3. Preguntas pendientes\n${b.questions.map(q=>`- ${q.id}: ${q.question} | ${q.reason} | Bloquea estimación: ${q.blocksEstimate?'Sí':'No'}`).join('\n') || 'Sin preguntas pendientes'}\n\n## 4. Riesgos y ambigüedades\n${b.risks.map(r=>`- ${r.id}: ${r.description} | Impacto: ${r.impact} | Mitigación/supuesto: ${r.mitigation} | Semáforo: ${r.severity}`).join('\n') || 'Sin riesgos identificados'}\n\n## 5. Alcance\n### Incluidos\n${bullet(b.included)}\n### Excluidos\n${bullet(b.excluded)}\n### Supuestos\n${bullet(b.assumptions)}\n### Criterios de aceptación\n${bullet(b.acceptanceCriteria)}\n\n## 6. Estimación orientativa en horas\n${b.estimates.map(e=>`- ${e.module}: ${e.minHours}–${e.maxHours} h | ${e.uncertainty}`).join('\n')}\nTotal: ${b.estimates.reduce((n,e)=>n+e.minHours,0)}–${b.estimates.reduce((n,e)=>n+e.maxHours,0)} h. Rango orientativo sujeto a los supuestos e incertidumbres indicados; no es un precio.\n\n## 7. Próximos pasos\n${bullet(b.nextSteps)}${data.editorContent?`\n\n## Observaciones y edición manual\n${editorText(data.editorContent)}`:''}\n`;
}
export async function render(data:DocumentData) {
  const md=markdown(data);
  const pdf=await new Promise<Buffer>((resolve,reject)=>{
    const document=new PDFDocument({margin:50,info:{Title:data.projectName,Author:data.author}});
    const chunks:Buffer[]=[];
    document.on('data',(chunk:Buffer)=>chunks.push(chunk)); document.on('end',()=>resolve(Buffer.concat(chunks))); document.on('error',reject);
    for(const line of md.split('\n')) document.font(line.startsWith('#')?'Helvetica-Bold':'Helvetica').fontSize(line.startsWith('# ')?20:line.startsWith('## ')?14:10).text(line.replace(/^#+ /,''),{lineGap:3});
    document.end();
  });
  const docx=await Packer.toBuffer(new Document({sections:[{children:md.split('\n').map(line=>new Paragraph({children:[new TextRun({text:line.replace(/^#+ /,''),bold:line.startsWith('#'),size:line.startsWith('# ')?36:22})]}))}]}));
  return {md:Buffer.from(md),pdf,docx};
}
