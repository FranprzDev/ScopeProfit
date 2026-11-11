import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CoreModule } from './core.module';
import { HealthController } from './health.controller';
import { ExportsController } from './modules/mcp/exports.controller';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]), CoreModule],
  controllers: [HealthController, ExportsController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
