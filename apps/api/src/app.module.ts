import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { HealthController } from './health.controller';
import { AuthController } from './modules/auth/auth.controller';
import { ProjectsController } from './modules/projects/projects.controller';
import { ChatController } from './modules/chat/chat.controller';
import { BriefController } from './modules/brief/brief.controller';
import { DocumentsController } from './modules/documents/documents.controller';
import { ChangeRequestsService } from './modules/projects/change-requests.service';

@Module({
  imports: [CoreModule, TelegramModule],
  controllers: [
    HealthController,
    AuthController,
    ProjectsController,
    ChatController,
    BriefController,
    DocumentsController,
  ],
  providers: [ChangeRequestsService],
})
export class AppModule {}
