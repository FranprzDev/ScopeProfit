import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma.service';
import { EmailService } from '../../email.service';
import { authorizedTelegramIds,decrypt,encrypt,encryptionKey,fail,hash,secureEqual,token } from '../../security';
@Injectable()
export class AuthService {
 constructor(private db:PrismaService,private email:EmailService) {}
 async request(email:string,projectId?:string,linkToken?:string) {
  email=email.toLowerCase();
  if(projectId) await this.checkLink(projectId,linkToken);
  const recent=await this.db.magicLink.count({where:{email,createdAt:{gte:new Date(Date.now()-60000)}}});if(recent>=2)return {sent:true};
  const raw=token();await this.db.magicLink.create({data:{email,projectId,linkToken:linkToken?encrypt(linkToken):null,tokenHash:hash(raw),expiresAt:new Date(Date.now()+900000)}});
  const url=`${process.env.WEB_URL}/api/auth/magic-link/verify?token=${raw}`;
  await this.email.send(email,'Ingresá a ScopeProfit',`<p>Tu enlace de acceso vence en 15 minutos y puede usarse una vez.</p><p><a href="${url}">Ingresar</a></p>`);return {sent:true};
 }
 async verify(raw:string) {
  return this.db.$transaction(async tx=>{const link=await tx.magicLink.findUnique({where:{tokenHash:hash(raw)}});if(!link||link.usedAt||link.expiresAt<new Date())fail('INVALID_MAGIC_LINK',401);
   const consumed=await tx.magicLink.updateMany({where:{id:link.id,usedAt:null},data:{usedAt:new Date()}});if(consumed.count!==1)fail('INVALID_MAGIC_LINK',401);
   if(link.projectId) await this.checkLink(link.projectId,link.linkToken?decrypt(link.linkToken):undefined);
   const user=await tx.user.upsert({where:{email:link.email},create:{email:link.email},update:{}});const sessionToken=token();await tx.session.create({data:{userId:user.id,tokenHash:hash(sessionToken),expiresAt:new Date(Date.now()+30*86400000)}});
   if(link.projectId)await tx.project.updateMany({where:{id:link.projectId,clientEmail:null},data:{clientEmail:link.email}});
   return {sessionToken,redirect:link.projectId?`/p/${link.projectId}?token=${encodeURIComponent(decrypt(link.linkToken!))}`:'/dashboard'};
  });
 }
 async session(raw?:string) { if(!raw)fail('UNAUTHENTICATED',401);const session=await this.db.session.findUnique({where:{tokenHash:hash(raw)},include:{user:true}});if(!session||session.revokedAt||session.expiresAt<new Date())fail('UNAUTHENTICATED',401);if(session.user.role==='professional'&&(!session.user.telegramId||!authorizedTelegramIds().includes(session.user.telegramId)))fail('FORBIDDEN',403);return session.user; }
 async logout(raw?:string) {if(raw)await this.db.session.updateMany({where:{tokenHash:hash(raw)},data:{revokedAt:new Date()}});return {loggedOut:true};}
 async checkLink(projectId:string,raw?:string) {if(!raw)fail('PROJECT_ACCESS_DENIED',403);const link=await this.db.projectLink.findUnique({where:{tokenHash:hash(raw)}});if(!link||link.projectId!==projectId||link.revokedAt||(link.expiresAt&&link.expiresAt<new Date()))fail('PROJECT_ACCESS_DENIED',403);return link;}
 async project(user:User,id:string,raw?:string) {const project=await this.db.project.findUnique({where:{id},include:{brief:true,document:{include:{versions:{orderBy:{version:'desc'},take:1}}}}});if(!project)fail('PROJECT_NOT_FOUND',404);if(user.role!=='professional')await this.checkLink(id,raw);return project;}
 professional(user:User) {if(user.role!=='professional'||!user.telegramId||!authorizedTelegramIds().includes(user.telegramId))fail('FORBIDDEN',403);}
 async telegramUser(id:string) {if(!authorizedTelegramIds().includes(id))fail('FORBIDDEN',403);return this.db.user.upsert({where:{telegramId:id},create:{telegramId:id,role:'professional'},update:{role:'professional'}});}
 async adminLink(user:User,projectId:string) {this.professional(user);const nonce=randomUUID();const exp=Date.now()+Number(process.env.ADMIN_EDIT_URL_TTL_DAYS??10)*86400000;await this.db.adminNonce.create({data:{nonce,userId:user.id,projectId,expiresAt:new Date(exp)}});const payload=Buffer.from(JSON.stringify({userId:user.id,projectId,permission:'edit',exp,nonce})).toString('base64url');const signature=createHmac('sha256',encryptionKey()).update(payload).digest('base64url');return `${process.env.WEB_URL}/api/auth/admin/verify?token=${payload}.${signature}`;}
 async verifyAdmin(raw:string) {const [payload,signature]=raw.split('.');if(!payload||!signature||!secureEqual(createHmac('sha256',encryptionKey()).update(payload).digest('base64url'),signature))fail('INVALID_ADMIN_LINK',401);let data:any;try{data=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{fail('INVALID_ADMIN_LINK',401);}if(data.exp<Date.now()||data.permission!=='edit')fail('INVALID_ADMIN_LINK',401);const user=await this.db.user.findUnique({where:{id:data.userId}});if(!user)fail('INVALID_ADMIN_LINK',401);this.professional(user);const sessionToken=token();await this.db.$transaction(async tx=>{const claim=await tx.adminNonce.updateMany({where:{nonce:data.nonce,userId:user.id,projectId:data.projectId,usedAt:null,expiresAt:{gt:new Date()}},data:{usedAt:new Date()}});if(claim.count!==1)fail('INVALID_ADMIN_LINK',401);await tx.session.create({data:{userId:user.id,tokenHash:hash(sessionToken),expiresAt:new Date(Math.min(data.exp,Date.now()+30*86400000))}});});return {sessionToken,redirect:`/p/${data.projectId}`};}
 publicUser(user:User) {return {id:user.id,email:user.email,role:user.role,hasAiApiKey:!!user.encryptedApiKey};}
 async saveKey(user:User,key:string) {this.professional(user);await this.db.user.update({where:{id:user.id},data:{encryptedApiKey:encrypt(key)}});await this.db.auditEvent.create({data:{actorId:user.id,action:'ai_key_updated',result:'success'}});return {hasAiApiKey:true};}
}
