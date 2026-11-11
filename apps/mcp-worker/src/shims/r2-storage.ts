/** Minimal storage interface shared by the R2 and KV backends (put/get/delete by key). */
export interface StorageBackend {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  get(
    key: string,
    options?: Record<string, unknown>,
  ): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | ArrayBuffer | null>;
  delete(key: string): Promise<unknown>;
}

/**
 * StorageService backed by R2 (binding STORAGE) or Workers KV (binding STORAGE_KV). Replaces the filesystem implementation
 * (apps/api/src/modules/storage/storage.service.ts) in the Worker bundle via the build's
 * path substitution; it keeps the exact public interface the domain services use.
 *
 * Image validation cannot decode pixels without sharp (native), so it checks the declared
 * MIME type, extension and magic bytes instead of a full decode. This is the one behavioral
 * difference from the filesystem service, which decodes with sharp.
 */
import { HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';

const MAGIC: { mime: string; extensions: string[]; bytes: number[] }[] = [
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'], bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', extensions: ['.png'], bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', extensions: ['.webp'], bytes: [0x52, 0x49, 0x46, 0x46] },
];

export class StorageService {
  constructor(private readonly bucket: StorageBackend) {}

  private async getObject(key: string): Promise<ArrayBuffer | null> {
    // R2Bucket.get returns an object with arrayBuffer(); KVNamespace.get(key, { type: 'arrayBuffer' })
    // returns the ArrayBuffer directly. Support both behind one call.
    const object = await this.bucket.get(key, { type: 'arrayBuffer' } as never);
    if (!object) return null;
    if (object instanceof ArrayBuffer) return object;
    return (object as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer();
  }

  private key(path: string) {
    const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = normalized.split('/');
    if (!normalized || parts.some((part) => part === '..' || part === '.' || part === ''))
      throw new HttpException({ code: 'INVALID_FILE_PATH', message: 'Invalid file path' }, 400);
    return parts.join('/');
  }

  async write(path: string, content: Buffer) {
    const key = this.key(path);
    await this.bucket.put(key, content);
    return {
      path: key,
      checksum: createHash('sha256').update(content).digest('hex'),
      size: content.length,
    };
  }

  async remove(path: string) {
    await this.bucket.delete(this.key(path));
  }

  async read(path: string): Promise<Buffer> {
    const bytes = await this.getObject(this.key(path));
    if (!bytes)
      throw new HttpException({ code: 'FILE_NOT_FOUND', message: 'Stored file not found' }, 404);
    return Buffer.from(bytes);
  }

  validateText(text: string) {
    if (!text.trim() || Buffer.byteLength(text, 'utf8') > 1024 * 1024 || text.includes('\0'))
      throw new HttpException(
        { code: 'INVALID_TEXT', message: 'Text must contain between 1 byte and 1 MB' },
        400,
      );
  }

  async validateImage(file: Express.Multer.File) {
    if (!file?.buffer?.length || file.buffer.length > 10 * 1024 * 1024)
      throw new HttpException({ code: 'INVALID_IMAGE', message: 'Image limit is 10 MB' }, 400);
    const name = (file.originalname || '').toLowerCase();
    const format = MAGIC.find(
      (entry) =>
        entry.mime === file.mimetype &&
        entry.extensions.some((ext) => name.endsWith(ext)) &&
        entry.bytes.every((byte, index) => file.buffer[index] === byte),
    );
    if (!format)
      throw new HttpException(
        { code: 'INVALID_IMAGE', message: 'Invalid JPEG, PNG or WebP image' },
        400,
      );
    return { mimeType: format.mime, size: file.buffer.length };
  }
}
