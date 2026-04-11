import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MwsController } from './mws.controller';
import { MwsTablePagesService } from './mws-table-pages.service';
import { MwsService } from './mws.service';

@Module({
  imports: [HttpModule],
  controllers: [MwsController],
  providers: [MwsService, MwsTablePagesService],
  exports: [MwsService, MwsTablePagesService],
})
export class MwsModule {}
