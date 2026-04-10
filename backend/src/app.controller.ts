import { Controller, Get } from '@nestjs/common';

@Controller('/api/v1/health')
export class AppController {
  @Get()
  getHealth() {
    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
    };
  }
}
