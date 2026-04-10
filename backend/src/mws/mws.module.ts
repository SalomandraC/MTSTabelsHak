import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MwsController } from './mws.controller';
import { MwsService } from './mws.service';

@Module({
  imports: [HttpModule],
  controllers: [MwsController],
  providers: [MwsService],
  exports: [MwsService],
})
export class MwsModule {}
