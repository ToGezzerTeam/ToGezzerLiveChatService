import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { WsGateway } from './ws/ws.gateway';
import { VoiceChatGateway } from './ws/ws.voice-chat.gateway';
import { RabbitmqService } from './rabbitmq/rabbitmq.service';
import { MediasoupService } from './mediasoup/mediasoup.service';
import { AppConfig } from './app.config';
import { WsJwtAuthService } from './ws/ws-jwt-auth.service';

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
  ],
  providers: [
    AppConfig,
    WsGateway,
    VoiceChatGateway,
    RabbitmqService,
    MediasoupService,
    WsJwtAuthService,
  ],
})
export class AppModule {}
