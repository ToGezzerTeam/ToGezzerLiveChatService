import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WsGateway } from './ws/ws.gateway';
import { VoiceChatGateway } from './ws/ws.voice-chat.gateway';
import { RabbitmqService } from './rabbitmq/rabbitmq.service';
import { MediasoupService } from './mediasoup/mediasoup.service';
import { AppConfig } from './app.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  providers: [
    AppConfig,
    WsGateway,
    VoiceChatGateway,
    RabbitmqService,
    MediasoupService,
  ],
})
export class AppModule {}
