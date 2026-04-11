import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { MessagePayload } from './ws.types';

@WebSocketGateway({ cors: { origin: '*' } })
export class WsGateway implements OnModuleInit {
  private readonly logger = new Logger(WsGateway.name);

  @WebSocketServer()
  private server?: Server;

  constructor(private readonly rabbitmq: RabbitmqService) {}

  onModuleInit() {
    this.rabbitmq.registerMessageHandler((message: MessagePayload) => {
      this.forwardRabbitMessage(message);
    });
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    await client.join(roomId);
    this.logger.log(`Socket ${client.id} joined room ${roomId}`);
  }

  private forwardRabbitMessage(message: MessagePayload) {
    if (!message.roomId) {
      this.logger.warn('Message ignoré: roomId manquant');
      return;
    }
    this.logger.log(`Envoi message vers room ${message.roomId}`);
    this.server?.to(message.roomId).emit('message', message);
  }
}
