import { Injectable, LOG_LEVELS, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfig {
  private rabbitmqHost: string;
  private rabbitmqPort: number;
  private rabbitmqUsername: string;
  private rabbitmqPassword: string;
  private rabbitmqMessageQueue: string;
  private port: number;
  private websocketOrigins: string | string[];
  private logLevels: LogLevel[];

  constructor(private readonly config: ConfigService) {}

  init() {
    this.port = this.config.get<number>('PORT', 3000);
    this.logLevels = this.parseLogLevels(
      this.config.get<string>('LOG_LEVELS', 'log,warn,error,fatal'),
    );
    this.websocketOrigins = this.parseOrigins(
      this.config.get<string>('WS_CORS_ORIGIN', '*'),
    );

    this.rabbitmqHost = this.config.get<string>('RABBITMQ_HOST', 'localhost');
    this.rabbitmqPort = this.config.get<number>('RABBITMQ_PORT', 5672);
    this.rabbitmqUsername = this.config.get<string>(
      'RABBITMQ_USERNAME',
      'guest',
    );
    this.rabbitmqPassword = this.config.get<string>(
      'RABBITMQ_PASSWORD',
      'guest',
    );
    this.rabbitmqMessageQueue = this.config.getOrThrow<string>(
      'RABBITMQ_MESSAGE_QUEUE',
    );
  }

  private parseOrigins(value: string): string | string[] {
    if (!value || value === '*') return '*';
    return this.parseStringArray(value);
  }

  private parseLogLevels(loglevels: string): LogLevel[] {
    return this.parseStringArray(loglevels)
      .map((item) => LOG_LEVELS.find((level) => item === level) ?? null)
      .filter((level) => !!level);
  }

  private parseStringArray(value: string): string[] {
    return value.split(',').map((item) => item.trim());
  }

  getPort(): number {
    return this.port;
  }

  getLogLevels(): LogLevel[] {
    return this.logLevels;
  }

  getWebSocketCorsOrigins(): string | string[] {
    return this.websocketOrigins;
  }

  getRabbitmqHost(): string {
    return this.rabbitmqHost;
  }

  getRabbitmqPort(): number {
    return this.rabbitmqPort;
  }

  getRabbitmqUsername(): string {
    return this.rabbitmqUsername;
  }

  getRabbitmqPassword(): string {
    return this.rabbitmqPassword;
  }

  getRabbitmqMessageQueue(): string {
    return this.rabbitmqMessageQueue;
  }

  getRabbitmqUrl(): string {
    return `amqp://${this.rabbitmqUsername}:${this.rabbitmqPassword}@${this.rabbitmqHost}:${this.rabbitmqPort}`;
  }
}
