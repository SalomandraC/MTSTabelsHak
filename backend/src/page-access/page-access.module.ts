import { Module } from '@nestjs/common';
import { MwsModule } from 'src/mws/mws.module';
import { PageAccessService } from './page-access.service';

@Module({
  imports: [MwsModule],
  providers: [PageAccessService],
  exports: [PageAccessService],
})
export class PageAccessModule {}
