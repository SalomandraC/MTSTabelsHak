import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { PrismaService } from './infra/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.setGlobalPrefix('');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('WikiLive Backend API')
    .setDescription('Backend API for WikiLive pages, collaboration and MWS Tables BFF')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('/docs', app, swaggerDocument);

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port);
  logger.log(`HTTP API listening on port ${port}`);
}

void bootstrap();
