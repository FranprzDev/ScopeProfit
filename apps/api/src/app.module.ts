import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CoreModule } from './core.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { HealthController } from './health.controller';
import { AuthController } from './modules/auth/auth.controller';
import { ProjectsController } from './modules/projects/projects.controller';
import { ChatController } from './modules/chat/chat.controller';
import { BriefController } from './modules/brief/brief.controller';
import { DocumentsController } from './modules/documents/documents.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    CoreModule,
    TelegramModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    ProjectsController,
    ChatController,
    BriefController,
    DocumentsController,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
