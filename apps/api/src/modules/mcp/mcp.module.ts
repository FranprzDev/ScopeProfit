import { Module } from '@nestjs/common';
import { CoreModule } from '../../core.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [CoreModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
