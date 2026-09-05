import { Injectable, HttpException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, relative, dirname, extname } from 'node:path';
import sharp from 'sharp';

@Injectable()
export class StorageService {
  private root = resolve(process.env.STORAGE_ROOT || './storage');
  private path(path: string) {
    const full = resolve(this.root, path);
    if (!path || relative(this.root, full).startsWith('..') || full === this.root) throw new HttpException({code:'INVALID_FILE_PATH',message:'Invalid file path'},400);
    return full;
  }
  async write(path: string, content: Buffer) {
    const full = this.path(path);
    await mkdir(dirname(full), {recursive:true});
    const temporary = `${full}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, {mode:0o600});
    await rename(temporary, full);
    return {path, checksum:createHash('sha256').update(content).digest('hex'),size:content.length};
  }
  read(path: string) { return readFile(this.path(path)); }
  validateText(text: string) {
    if (!text.trim() || Buffer.byteLength(text,'utf8') > 1024*1024 || text.includes('\0')) throw new HttpException({code:'INVALID_TEXT',message:'Text must contain between 1 byte and 1 MB'},400);
  }
  async validateImage(file: Express.Multer.File) {
    if (!file?.buffer?.length || file.buffer.length > 10*1024*1024) throw new HttpException({code:'INVALID_IMAGE',message:'Image limit is 10 MB'},400);
    const formats:Record<string,{mime:string;extensions:string[]}> = {jpeg:{mime:'image/jpeg',extensions:['.jpg','.jpeg']},png:{mime:'image/png',extensions:['.png']},webp:{mime:'image/webp',extensions:['.webp']}};
    try {
      const image = sharp(file.buffer,{limitInputPixels:40_000_000,failOn:'warning'});
      const metadata = await image.metadata();
      const format = formats[metadata.format || ''];
      if (!format || file.mimetype !== format.mime || !format.extensions.includes(extname(file.originalname).toLowerCase()) || (metadata.pages || 1)>1) throw new Error('format');
      await image.raw().toBuffer();
      return {mimeType:format.mime,size:file.buffer.length};
    } catch { throw new HttpException({code:'INVALID_IMAGE',message:'Invalid JPEG, PNG or WebP image'},400); }
  }
}
