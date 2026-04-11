import { Module } from '@nestjs/common';
import { MwsModule } from 'src/mws/mws.module';
import { WorkspaceTreeController } from './workspace-tree.controller';
import { WorkspaceTreeService } from './workspace-tree.service';

@Module({
  imports: [MwsModule],
  controllers: [WorkspaceTreeController],
  providers: [WorkspaceTreeService],
})
export class WorkspaceTreeModule {}
