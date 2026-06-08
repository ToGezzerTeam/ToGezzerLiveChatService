import { Module, OnModuleInit } from '@nestjs/common';
import { RabbitmqService } from './rabbitmq.service';
import { WsGateway } from '../ws/ws.gateway';
import { AppConfig } from '../app.config';
import { MessagePayload, RoomEventPayload, UserPayload } from '../ws/ws.types';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WsJwtAuthService } from '../auth/ws-jwt-auth.service';
import { WsJwtAuthGuard } from '../auth/ws-jwt.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    RabbitmqService,
    WsGateway,
    WsJwtAuthService,
    WsJwtAuthGuard,
    AppConfig,
  ],
  exports: [RabbitmqService],
})
export class RabbitmqModule implements OnModuleInit {
  constructor(
    private readonly rabbitmq: RabbitmqService,
    private readonly gateway: WsGateway,
    private readonly config: AppConfig,
  ) {}

  async onModuleInit() {
    const messageQueue = this.config.getRabbitmqMessageQueue();
    const userQueue = this.config.getRabbitmqUserQueue();
    const roomQueue = this.config.getRabbitmqRoomQueue();

    await this.rabbitmq.registerQueue(
      messageQueue.queue,
      messageQueue.routingKey,
      (msg) => this.gateway.forwardRabbitMessage(msg as MessagePayload),
    );

    await this.rabbitmq.registerQueue(
      userQueue.queue,
      userQueue.routingKey,
      (msg) => this.gateway.forwardToUser(msg as UserPayload),
    );

    await this.rabbitmq.registerQueue(
      roomQueue.queue,
      roomQueue.routingKey,
      (msg) => this.gateway.forwardToRoom(msg as RoomEventPayload),
    );
  }
}
