import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { MessagePayload } from './ws.types';
import { WsJwtAuthService } from './ws-jwt-auth.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class WsGateway implements OnModuleInit, OnGatewayInit {
  private readonly logger = new Logger(WsGateway.name);

  @WebSocketServer()
  private server?: Server;

  constructor(
    private readonly rabbitmq: RabbitmqService,
    private readonly wsJwtAuth: WsJwtAuthService,
  ) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      try {
        this.wsJwtAuth.authenticateSocket(socket);
        next();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unauthorized connection';
        this.logger.warn(`Socket ${socket.id} rejected: ${message}`);
        next(new Error(message));
      }
    });
  }

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
