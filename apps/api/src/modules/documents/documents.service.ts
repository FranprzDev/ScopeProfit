import { Injectable, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { BriefData, DocumentData, TiptapNode } from '@scopeprofit/contracts';
import { PrismaService } from '../../prisma.service';
import { EmailService } from '../../email.service';
import { StorageService } from '../storage/storage.service';
import { render, validateEditor } from './render';

type Artifact = {path:string;checksum:string;size:number};
type Artifacts = Record<'md'|'pdf'|'docx',Artifact>;
function fail(code:string,message:string,status=409):never{throw new HttpException({code,message},status);}
const json=(value:unknown)=>value as Prisma.InputJsonValue;
@Injectable()
export class DocumentsService {
  constructor(private prisma:PrismaService, private storage:StorageService, private email:EmailService) {}
  async latest(projectId:string) {
    const document=await this.prisma.document.findUnique({where:{projectId},include:{versions:{orderBy:{version:'desc'},take:1}}});
    return document?.versions[0] || null;
  }
  async generate(projectId:string,actorId:string,editorContent?:TiptapNode,expectedVersion?:number) {
    if(editorContent) { try {validateEditor(editorContent);if(editorContent.type!=='doc') throw new Error();}catch {fail('INVALID_EDITOR_CONTENT','Invalid document editor content',400);} }
    const project=await this.prisma.project.findUnique({where:{id:projectId},include:{owner:true,brief:true,document:{include:{versions:{orderBy:{version:'desc'},take:1}}}}});
    if(!project?.brief) return fail('BRIEF_NOT_FOUND','Brief not found',404);
    if(['approved','delivered','archived'].includes(project.status)) return fail('PROJECT_LOCKED','Project is not editable');
    const previous=project.document?.versions[0];
    const current=project.document?.currentVersion || 0;
    if(expectedVersion!==undefined && expectedVersion!==current) return fail('VERSION_CONFLICT','Document changed; reload before saving');
    const version=current+1;
    const data:DocumentData={projectName:project.name,clientName:project.clientEmail || 'Cliente',author:project.owner.email || 'Profesional',date:new Date().toISOString(),version,brief:project.brief.data as unknown as BriefData,editorContent:editorContent || previous?.editorContent as unknown as TiptapNode || null};
    const buffers=await render(data);
    const artifacts={} as Artifacts;
    const generation=randomUUID();
    for(const format of ['md','pdf','docx'] as const) artifacts[format]=await this.storage.write(`${projectId}/documents/${version}/${generation}.${format}`,buffers[format]);
    return this.prisma.$transaction(async tx=>{
      const live=await tx.project.findUnique({where:{id:projectId},include:{brief:true}});
      if(!live || live.brief?.version!==project.brief!.version || ['approved','delivered','archived'].includes(live.status)) return fail('VERSION_CONFLICT','Project changed during generation');
      const document=await tx.document.upsert({where:{projectId},create:{projectId},update:{}});
      const updated=await tx.document.updateMany({where:{id:document.id,currentVersion:current},data:{currentVersion:version}});
      if(updated.count!==1) return fail('VERSION_CONFLICT','Document changed during generation');
      const saved=await tx.documentVersion.create({data:{documentId:document.id,version,briefVersion:project.brief!.version,data:json(data),editorContent:data.editorContent?json(data.editorContent):Prisma.JsonNull,artifacts:json(artifacts)}});
      await tx.project.update({where:{id:projectId},data:{status:'in_review'}});
      await tx.auditEvent.create({data:{projectId,actorId,action:editorContent?'document.edited':'document.generated',result:'success',metadata:{version,briefVersion:project.brief!.version}}});
      return saved;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }
  async download(projectId:string,version:number,format:'md'|'pdf'|'docx') {
    if(!['md','pdf','docx'].includes(format)) return fail('INVALID_FORMAT','Unknown document format',400);
    const document=await this.prisma.document.findUnique({where:{projectId}});
    const saved=document && await this.prisma.documentVersion.findUnique({where:{documentId_version:{documentId:document.id,version}}});
    if(!saved) return fail('DOCUMENT_NOT_FOUND','Document not found',404);
    const artifact=(saved.artifacts as unknown as Artifacts)[format];
    if(!artifact) return fail('DOCUMENT_NOT_FOUND','Document artifact not found',404);
    return {buffer:await this.storage.read(artifact.path),name:`scope-${projectId}-v${version}.${format}`,mimeType:{md:'text/markdown; charset=utf-8',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}[format]};
  }
  async approve(projectId:string,userId:string,version:number) {
    await this.prisma.$transaction(async tx=>{
      const user=await tx.user.findUnique({where:{id:userId}});
      if(user?.role!=='professional') return fail('FORBIDDEN','Professional access required',403);
      const project=await tx.project.findUnique({where:{id:projectId},include:{brief:true,document:true}});
      if(!project?.document) return fail('DOCUMENT_NOT_FOUND','Document not found',404);
      if(project.document.currentVersion!==version) return fail('VERSION_CONFLICT','Approve the current document version');
      const saved=await tx.documentVersion.findUnique({where:{documentId_version:{documentId:project.document.id,version}}});
      if(!saved || saved.briefVersion!==project.brief?.version) return fail('VERSION_CONFLICT','Document does not match current brief');
      if(saved.approvedAt) return;
      if(!['in_review','changes_requested'].includes(project.status) || ['pending','running'].includes(project.agentStatus)) return fail('PROJECT_NOT_REVIEWABLE','Project is not ready for review');
      const brief=project.brief.data as unknown as BriefData;
      if(!brief.summary.trim() || !brief.requirements.length || !brief.included.length || !brief.excluded.length || !brief.assumptions.length || !brief.acceptanceCriteria.length || !brief.nextSteps.length || !brief.estimates.length || brief.requirements.some(r=>!r.source.trim()) || brief.estimates.some(e=>!Number.isFinite(e.minHours)||!Number.isFinite(e.maxHours)||e.minHours<0||e.maxHours<e.minHours)) return fail('DOCUMENT_INCOMPLETE','Complete the required document sections before approval');
      if(brief.risks.some(r=>r.severity==='red'&&!r.mitigation.trim())) return fail('UNMITIGATED_RISK','Red risks require an explicit mitigation or assumption');
      if(brief.questions.some(q=>q.blocksEstimate)) return fail('ESTIMATE_BLOCKED','Resolve blocking questions before approval');
      await tx.documentVersion.update({where:{id:saved.id},data:{status:'approved',approvedBy:userId,approvedAt:new Date(),deliveryKey:`scopeprofit-${saved.id}`}});
      await tx.project.update({where:{id:projectId},data:{status:'approved'}});
      await tx.auditEvent.create({data:{projectId,actorId:userId,action:'document.approved',result:'success',metadata:{version}}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return this.deliver(projectId,version);
  }
  async deliver(projectId:string,version:number) {
    const project=await this.prisma.project.findUnique({where:{id:projectId},include:{document:true}});
    if(!project?.document) return fail('DOCUMENT_NOT_FOUND','Document not found',404);
    const saved=await this.prisma.documentVersion.findUnique({where:{documentId_version:{documentId:project.document.id,version}}});
    if(!saved?.approvedAt) return fail('DOCUMENT_NOT_APPROVED','Document requires approval');
    if(saved.deliveredAt) return saved;
    if(!project.clientEmail) return fail('CLIENT_EMAIL_REQUIRED','Client must sign in before document delivery');
    const pdf=await this.download(projectId,version,'pdf');
    const docx=await this.download(projectId,version,'docx');
    await this.email.send(project.clientEmail,'Tu alcance aprobado — Scope-to-Profit','<p>Adjuntamos el alcance aprobado en PDF y Word editable.</p>',[pdf,docx].map(file=>({name:file.name,content:file.buffer.toString('base64')})),saved.deliveryKey!);
    return this.prisma.$transaction(async tx=>{
      const changed=await tx.documentVersion.updateMany({where:{id:saved.id,deliveredAt:null},data:{deliveredAt:new Date(),status:'delivered'}});
      if(changed.count) {
        await tx.project.update({where:{id:projectId},data:{status:'delivered'}});
        await tx.auditEvent.create({data:{projectId,action:'document.delivered',result:'success',metadata:{version}}});
      }
      return tx.documentVersion.findUnique({where:{id:saved.id}});
    });
  }
}
