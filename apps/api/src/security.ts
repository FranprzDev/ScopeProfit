import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpException } from '@nestjs/common';
export function fail(code:string,status=400,message=code):never {throw new HttpException({code,message},status);}
export const hash = (value:string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export function encryptionKey() { const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64'); if(key.length !== 32) throw new Error('ENCRYPTION_KEY must encode 32 bytes'); return key; }
export function encrypt(value:string) { const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);return Buffer.concat([iv,cipher.update(value),cipher.final(),cipher.getAuthTag()]).toString('base64'); }
export function decrypt(value:string) { const bytes=Buffer.from(value,'base64');const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString(); }
export function secureEqual(a:string,b:string) { const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y); }
export const authorizedTelegramIds = () => (process.env.TELEGRAM_AUTHORIZED_USER_IDS??'').split(',').map(s=>s.trim()).filter(Boolean);
