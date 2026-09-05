import { Controller, Get } from '@nestjs/common';
import { ok } from './response';

@Controller('health')
export class HealthController {
  @Get() health() { return ok({ status: 'ok' }); }
}
