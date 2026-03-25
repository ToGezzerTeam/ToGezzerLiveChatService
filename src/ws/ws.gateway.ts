import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import type { IncomingMessagePayload } from './ws.types';

@WebSocketGateway({ cors: { origin: '*' } })
export class WsGateway {
  private readonly logger = new Logger(WsGateway.name);

  constructor(private readonly rabbitmq: RabbitmqService) {}

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() data: IncomingMessagePayload,
    @ConnectedSocket() client: Socket,
  ) {
    // L'UUID est généré côté serveur à la réception du message.
    // On ignore volontairement un éventuellement `data.uuid` envoyé par le client.
    const uuid = randomUUID();

    this.logger.log('Message WebSocket reçu');
    this.logger.debug({ uuid, data }, 'Payload reçu');

    const messageToSend = {
      from: 'LiveChatService',
      payload: data,
      timestamp: Date.now(),
      createdAt: Date.now(),
      uuid,
    };

    this.logger.log('Envoi du message vers RabbitMQ');
    this.logger.debug({ message: messageToSend }, 'Message RabbitMQ');

    await this.rabbitmq.sendMessage(messageToSend);

    client.emit('response', { status: 'queued', uuid });
  }
}
