import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'node:net';
type MessageContent = {
  type?: string;
  value?: string;
};

type IncomingMessagePayload = {
  roomId?: string;
  authorId?: string;
  answerTo?: string;
  uuid?: string;
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
    await this.rabbitmq.sendMessage({
      createdAt: Date.now(),
      ...data,
    });

    client.emit('response', { status: 'queued' });
  }
}
