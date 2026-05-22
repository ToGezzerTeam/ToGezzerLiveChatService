import { Module } from '@nestjs/common';
import { WsGateway } from './ws/ws.gateway';
import { RabbitmqService } from './rabbitmq/rabbitmq.service';
import {ConfigModule} from "@nestjs/config";
import {AppConfig} from "./app.config";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  providers: [AppConfig, WsGateway, RabbitmqService],
})
export class AppModule {}
