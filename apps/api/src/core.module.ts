import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EmailService } from './email.service';
import { AuthService } from './modules/auth/auth.service';
import { ProjectsService } from './modules/projects/projects.service';
import { AgentService } from './modules/agent/agent.service';
import { DocumentsService } from './modules/documents/documents.service';
import { StorageService } from './modules/storage/storage.service';
import { ChangeRequestsService } from './modules/projects/change-requests.service';
import { TimeEntriesService } from './modules/projects/time-entries.service';

const providers = [
  PrismaService,
  EmailService,
  AuthService,
  ProjectsService,
  AgentService,
  DocumentsService,
  StorageService,
  ChangeRequestsService,
  TimeEntriesService,
];

@Global()
@Module({ providers, exports: providers })
export class CoreModule {}
