import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import {ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway} from "@nestjs/websockets";
import {Socket} from "node:net";

@WebSocketGateway({ cors: { origin: '*' } })
export class WsGateway {
  constructor(private readonly rabbitmq: RabbitmqService) {}

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
