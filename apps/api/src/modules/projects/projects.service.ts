import { Injectable } from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { emptyBrief } from '@scopeprofit/contracts';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { decrypt,encrypt,fail,hash,token } from '../../security';
@Injectable()
export class ProjectsService {
 constructor(private db:PrismaService,private auth:AuthService) {}
 async create(user:User,name:string,clientEmail?:string) {this.auth.professional(user);const raw=token();const project=await this.db.project.create({data:{name,ownerId:user.id,clientEmail:clientEmail?.toLowerCase(),brief:{create:{data:emptyBrief() as unknown as Prisma.InputJsonValue}},document:{create:{}},links:{create:{tokenHash:hash(raw),encryptedToken:encrypt(raw)}}}});await this.db.auditEvent.create({data:{projectId:project.id,actorId:user.id,action:'project_created',result:'success'}});return {...project,clientUrl:this.url(project.id,raw)};}
 url(id:string,raw:string){return `${process.env.WEB_URL}/p/${id}?token=${raw}`;}
 async clientUrl(id:string){const link=await this.db.projectLink.findFirst({where:{projectId:id,revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},orderBy:{createdAt:'desc'}});return link?this.url(id,decrypt(link.encryptedToken)):null;}
 async list(user:User,limit=30,cursor?:string){const items=await this.db.project.findMany({where:user.role==='professional'?{}:{clientEmail:user.email??''},orderBy:{id:'asc'},take:limit+1,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,name:true,clientEmail:true,status:true,agentStatus:true,createdAt:true,updatedAt:true}});const more=items.length>limit;if(more)items.pop();return {items,nextCursor:more?items.at(-1)!.id:null};}
 async link(id:string,user:User,action:'regenerate'|'revoke'|'expire',expiresAt?:Date){this.auth.professional(user);await this.auth.project(user,id);const raw=token();await this.db.$transaction(async tx=>{if(action==='expire'){if(!expiresAt||expiresAt<new Date())fail('INVALID_EXPIRATION');await tx.projectLink.updateMany({where:{projectId:id,revokedAt:null},data:{expiresAt}});}else{await tx.projectLink.updateMany({where:{projectId:id,revokedAt:null},data:{revokedAt:new Date()}});if(action==='regenerate')await tx.projectLink.create({data:{projectId:id,tokenHash:hash(raw),encryptedToken:encrypt(raw)}});}await tx.auditEvent.create({data:{projectId:id,actorId:user.id,action:`link_${action}`,result:'success'}});});return {clientUrl:action==='regenerate'?this.url(id,raw):await this.clientUrl(id)};}
 async archive(id:string,user:User){this.auth.professional(user);await this.db.project.update({where:{id},data:{status:'archived'}});await this.db.auditEvent.create({data:{projectId:id,actorId:user.id,action:'project_archived',result:'success'}});return {archived:true};}
}
