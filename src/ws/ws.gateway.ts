import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
type MessageContent = {
  type?: string;
  value?: string;
};

type IncomingMessagePayload = {
  roomId?: string;
  authorId?: string;
  answerTo?: string;
  state?: string;
  content?: MessageContent;
};

@WebSocketGateway({ cors: { origin: '*' } })
export class WsGateway {
  constructor(private readonly rabbitmq: RabbitmqService) {}

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() data: IncomingMessagePayload,
    @ConnectedSocket() client: Socket,
  ) {
    // L'UUID est généré côté serveur à la réception du message.
    // On ignore volontairement un éventuellement `data.uuid` envoyé par le client.
    const uuid = randomUUID();

    await this.rabbitmq.sendMessage({
      createdAt: Date.now(),
      ...data,
      uuid,
    });

    client.emit('response', { status: 'queued', uuid });
  }
}
