import { Controller, Get } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('/api/v1/health')
export class AppController {
  @Public()
  @Get()
  getHealth() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
    };
  }
}
