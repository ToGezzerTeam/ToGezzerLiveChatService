import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { connect, Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { AppConfig } from '../app.config';

type RabbitMessageHandler = (message: unknown) => Promise<void> | void;

@Injectable()
export class RabbitmqService implements OnModuleInit {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection!: ChannelModel;
  private channel!: Channel;
  private messageHandler?: RabbitMessageHandler;

  constructor(private readonly config: AppConfig) {}

  async onModuleInit() {
    const exchange = this.config.getRabbitmqExchange();
    const queue = this.config.getRabbitmqMessageQueue();
    const routingKey = this.config.getRabbitmqRoutingKey();

    this.connection = await connect(this.config.getRabbitmqUrl());
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(
      exchange,
      this.config.getRabbitmqExchangeType(),
      {
        durable: true,
      },
    );
    await this.channel.assertQueue(queue, { durable: true });
    await this.channel.bindQueue(queue, exchange, routingKey);
    await this.channel.consume(queue, (message) => {
      void this.handleIncomingMessage(message);
    });

    this.logger.log(
      `RabbitMQ consumer started on queue="${queue}" exchange="${exchange}" routingKey="${routingKey}"`,
    );
  }

  registerMessageHandler(handler: RabbitMessageHandler) {
    this.messageHandler = handler;
  }

  private async handleIncomingMessage(message: ConsumeMessage | null) {
    if (!message) return;

    try {
      const parsedMessage: unknown = JSON.parse(
        message.content.toString('utf-8'),
      );

      if (this.messageHandler) {
        await this.messageHandler(parsedMessage);
      }

      this.channel.ack(message);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Invalid RabbitMQ message payload: ${reason}`);
      this.channel.nack(message, false, false);
    }
  }
}
