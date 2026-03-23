import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { AppConfig } from './app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const appConfig = app.get(AppConfig);
  appConfig.init();

  app.useLogger(appConfig.getLogLevels());
  Logger.log(
    `Using Logger with levels : ${appConfig.getLogLevels()}`,
    'Bootstrap',
  );

  app.enableCors({
    origin: appConfig.getWebSocketCorsOrigins(),
    credentials: true,
  });
  Logger.log(
    `Enabled Cors with origins : ${appConfig.getWebSocketCorsOrigins()}`,
    'Bootstrap',
  );

  const port = appConfig.getPort();
  await app.listen(port);

  Logger.log(`Server running on port ${port}`, 'Bootstrap');
}

bootstrap();
