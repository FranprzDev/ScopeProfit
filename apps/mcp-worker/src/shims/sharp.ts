/**
 * sharp replacement for the Worker bundle (sharp is a native module and cannot run on
 * Cloudflare Workers). Only reached when an image exceeds 2 MB (scope-tools downscale path);
 * the worker rejects those images with a clear error instead of downscaling. Format and size
 * validation for stored images happens in the R2 storage service without decoding pixels.
 */
import { HttpException } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function sharp(..._args: unknown[]): any {
  throw new HttpException(
    {
      code: 'IMAGE_TOO_LARGE',
      message:
        'Images over 2 MB cannot be processed on this server yet; send a smaller image or a public URL under 2 MB.',
    },
    413,
  );
}
