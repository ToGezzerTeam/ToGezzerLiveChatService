import { Injectable, OnModuleInit } from '@nestjs/common';
import {connect, Channel, ChannelModel} from 'amqplib';
import {AppConfig} from "../app.config";

@Injectable()
export class RabbitmqService implements OnModuleInit {
    private connection: ChannelModel;
    private channel: Channel;

    constructor(private readonly config: AppConfig) {}

    async onModuleInit() {
        this.connection = await connect(this.config.getRabbitmqUrl());
        this.channel = await this.connection.createChannel();
        await this.channel.assertQueue(this.config.getRabbitmqMessageQueue());
    }

    async sendMessage(message: any) {
        const buffer = Buffer.from(JSON.stringify(message));
        this.channel.sendToQueue(this.config.getRabbitmqMessageQueue(), buffer);
    }
}
