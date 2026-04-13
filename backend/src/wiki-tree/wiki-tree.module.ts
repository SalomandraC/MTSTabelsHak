import { Module } from '@nestjs/common';
import { MwsModule } from 'src/mws/mws.module';
import { WikiTreeController } from './wiki-tree.controller';
import { WikiTreeService } from './wiki-tree.service';

@Module({
  imports: [MwsModule],
  controllers: [WikiTreeController],
  providers: [WikiTreeService],
  exports: [WikiTreeService],
})
export class WikiTreeModule {}
