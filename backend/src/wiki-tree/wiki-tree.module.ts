import { Module } from '@nestjs/common';
import { WikiTreeController } from './wiki-tree.controller';
import { WikiTreeService } from './wiki-tree.service';

@Module({
  controllers: [WikiTreeController],
  providers: [WikiTreeService],
  exports: [WikiTreeService],
})
export class WikiTreeModule {}
