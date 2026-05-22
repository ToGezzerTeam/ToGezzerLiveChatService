import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { UseGuards } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WsJwtAuthGuard } from '../auth/ws-jwt.guard';

@WebSocketGateway({ cors: { origin: '*' } })
export class WsGateway {
  constructor(private readonly rabbitmq: RabbitmqService) {}

  @UseGuards(WsJwtAuthGuard)
  @SubscribeMessage('message')
  async handleMessage(
      @MessageBody() data: any,
      @ConnectedSocket() client: Socket,
  ) {
    await this.rabbitmq.sendMessage({
      from: "LiveChatService",
      payload: data,
      timestamp: Date.now(),
    });

    client.emit('response', { status: 'queued' });
  }
}
