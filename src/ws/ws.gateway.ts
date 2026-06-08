import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { MessagePayload, RoomEventPayload, UserPayload } from './ws.types';
import { WsJwtAuthGuard } from '../auth/ws-jwt.guard';
import { WsJwtAuthService } from '../auth/ws-jwt-auth.service';

@WebSocketGateway({ cors: { origin: '*' } })
@UseGuards(WsJwtAuthGuard)
export class WsGateway {
  private readonly logger = new Logger(WsGateway.name);

  @WebSocketServer()
  private server?: Server;

  constructor(private readonly wsJwtAuthService: WsJwtAuthService) {}

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.wsJwtAuthService.authenticateSocket(client).uuid;
    await client.join(roomId);
    this.logger.log(
      `Socket ${client.id} (user ${userId}) joined room ${roomId}`,
    );
  }

  @SubscribeMessage('connectServer')
  async handleConnectServer(
    @MessageBody() serverUuid: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.wsJwtAuthService.authenticateSocket(client).uuid;
    await client.join(serverUuid);
    this.logger.log(
      `Socket ${client.id} (user ${userId}) connected server ${serverUuid}`,
    );
  }

  forwardRabbitMessage(message: MessagePayload) {
    if (!message.roomId) {
      this.logger.warn('Message ignoré: roomId manquant');
      return;
    }
    this.logger.log(`Envoi message vers room ${message.roomId}`);
    this.server?.to(message.roomId).emit('message', message);
  }

  public forwardToUser(message: UserPayload) {
    if (!message.serverUuid) {
      this.logger.warn('Message ignoré: serverUuid manquant');
      return;
    }
    this.logger.log(
      `Envoi message user join vers server ${message.serverUuid}`,
    );
    this.server?.to(message.serverUuid).emit('user', message);
  }

  public forwardToRoom(message: RoomEventPayload) {
    if (!message.serverUuid) {
      this.logger.warn('Message ignoré: serverUuid manquant');
      return;
    }
    this.logger.log(
      `Envoi message ${message.statusEvent} room vers server ${message.serverUuid}`,
    );
    this.server?.to(message.serverUuid).emit('room', message);
  }
}
