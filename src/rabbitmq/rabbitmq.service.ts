import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { connect, Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { AppConfig } from '../app.config';

type RabbitMessageHandler = (message: unknown) => Promise<void> | void;

@Injectable()
export class RabbitmqService implements OnModuleInit {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection!: ChannelModel;
  private channel!: Channel;

  constructor(private readonly config: AppConfig) {}

  async onModuleInit() {
    const exchange = this.config.getRabbitmqExchange();

    this.connection = await connect(this.config.getRabbitmqUrl());
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(
      exchange,
      this.config.getRabbitmqExchangeType(),
      { durable: true },
    );

    this.logger.log(`RabbitMQ connected to exchange="${exchange}"`);
  }

  async registerQueue(
    queue: string,
    routingKey: string,
    handler: RabbitMessageHandler,
  ) {
    const exchange = this.config.getRabbitmqExchange();

    await this.channel.assertQueue(queue, { durable: true });
    await this.channel.bindQueue(queue, exchange, routingKey);
    await this.channel.consume(queue, (message) => {
      void this.handleIncomingMessage(message, { queue, handler });
    });

    this.logger.log(
      `RabbitMQ consumer started on queue="${queue}" exchange="${exchange}" routingKey="${routingKey}"`,
    );
  }

  private async handleIncomingMessage(
    message: ConsumeMessage | null,
    binding: { queue: string; handler: RabbitMessageHandler },
  ) {
    if (!message) return;

    try {
      const parsedMessage: unknown = JSON.parse(
        message.content.toString('utf-8'),
      );
      await binding.handler(parsedMessage);
      this.channel.ack(message);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Invalid RabbitMQ message on queue="${binding.queue}": ${reason}`,
      );
      this.channel.nack(message, false, false);
    }
  }
}
