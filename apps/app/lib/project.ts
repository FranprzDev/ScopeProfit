import type { AgentStatus, ProjectStatus, TiptapNode } from '@scopeprofit/contracts';
export const statusLabels: Record<ProjectStatus,string> = {draft:'Borrador',in_review:'En revisión',changes_requested:'Cambios solicitados',approved:'Aprobado',delivered:'Entregado',archived:'Archivado'};
export const agentLabels: Record<AgentStatus,string> = {idle:'Al día',pending:'Preparando análisis…',running:'Actualizando el Brief…',failed:'El análisis necesita un reintento',agent_configuration_required:'Falta configurar la IA'};
export const POLL_INTERVAL = 10_000;
export const POLL_MAX_DURATION = 30 * 60_000;
export function shouldPoll(status: AgentStatus, errors: number, elapsed: number) { return (status === 'pending' || status === 'running') && errors < 5 && elapsed < POLL_MAX_DURATION; }
export function textDocument(text: string): TiptapNode { return {type:'doc',content:text.split('\n').map(line=>({type:'paragraph',...(line?{content:[{type:'text',text:line}]}:{})}))}; }
export function documentText(node: TiptapNode): string { if(node.type==='text')return node.text??'';const separator=['doc','bulletList','orderedList'].includes(node.type)?'\n':'';return(node.content??[]).map(documentText).join(separator); }
export function validateImage(file: {size:number;type:string}): string|null { if(!['image/jpeg','image/png','image/webp'].includes(file.type))return 'Solo se permiten imágenes JPG, PNG o WebP.';if(file.size>10*1024*1024)return 'Cada imagen puede pesar hasta 10 MB.';return null; }
