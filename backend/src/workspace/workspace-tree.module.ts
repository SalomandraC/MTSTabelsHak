import { Module } from '@nestjs/common';
import { MwsModule } from 'src/mws/mws.module';
import { PageAccessModule } from 'src/page-access/page-access.module';
import { WorkspaceTreeController } from './workspace-tree.controller';
import { WorkspaceTreeService } from './workspace-tree.service';

@Module({
  imports: [MwsModule, PageAccessModule],
  controllers: [WorkspaceTreeController],
  providers: [WorkspaceTreeService],
})
export class WorkspaceTreeModule {}
