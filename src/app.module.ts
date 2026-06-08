import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { WsGateway } from './ws/ws.gateway';
import { VoiceChatGateway } from './ws/ws.voice-chat.gateway';
import { MediasoupService } from './mediasoup/mediasoup.service';
import { AppConfig } from './app.config';
import { WsJwtAuthService } from './auth/ws-jwt-auth.service';
import { WsJwtAuthGuard } from './auth/ws-jwt.guard';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
    RabbitmqModule,
  ],
  providers: [
    AppConfig,
    WsGateway,
    VoiceChatGateway,
    MediasoupService,
    WsJwtAuthGuard,
    WsJwtAuthService,
  ],
})
export class AppModule {}
