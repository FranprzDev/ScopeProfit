import { Injectable } from '@nestjs/common';
import { fail } from './security';
@Injectable()
export class EmailService {
 async send(to:string,subject:string,html:string,attachments?:{name:string;content:string}[],idempotencyKey?:string) {
  const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'api-key':process.env.BREVO_API_KEY??'','content-type':'application/json'},body:JSON.stringify({sender:{email:process.env.BREVO_SENDER_EMAIL,name:process.env.BREVO_SENDER_NAME??'ScopeProfit'},to:[{email:to}],subject,htmlContent:html,attachment:attachments,headers:idempotencyKey?{'idempotencyKey':idempotencyKey}:undefined})});
  if(!response.ok) fail('EMAIL_DELIVERY_FAILED',502); return await response.json() as {messageId:string};
 }
}
