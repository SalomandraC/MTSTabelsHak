import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { CollabModule } from 'src/collab/collab.module';
import { MwsModule } from 'src/mws/mws.module';
import { PagesModule } from 'src/pages/pages.module';
import { ObsidianController } from './obsidian.controller';
import { ObsidianService } from './obsidian.service';

@Module({
  imports: [AuthModule, MwsModule, PagesModule, CollabModule],
  controllers: [ObsidianController],
  providers: [ObsidianService],
})
export class ObsidianModule {}
