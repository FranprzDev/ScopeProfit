import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request,Response } from 'express';
@Catch()
export class ApiErrorHandler implements ExceptionFilter {
 catch(error:unknown,host:ArgumentsHost) {const context=host.switchToHttp();const req=context.getRequest<Request>();const res=context.getResponse<Response>();const status=error instanceof HttpException?error.getStatus():500;const body=error instanceof HttpException?error.getResponse():null;const detail=typeof body==='object'&&body?body as Record<string,unknown>:{};const requestId=res.getHeader('x-request-id')?.toString()??randomUUID();const code=typeof detail.code==='string'?detail.code:status===400?'VALIDATION_FAILED':status===401?'UNAUTHENTICATED':status===403?'FORBIDDEN':status===404?'NOT_FOUND':'INTERNAL_ERROR';
 console.error(JSON.stringify({event:'request_failed',requestId,method:req.method,status,code}));res.status(status).json({success:false,error:{code,message:typeof detail.message==='string'?detail.message:status>=500?'Unable to complete request':'Invalid request',details:status===400&&Array.isArray(detail.message)?detail.message:null,requestId}}); }
}
