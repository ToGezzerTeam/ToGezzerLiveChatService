import { Test, TestingModule } from '@nestjs/testing';
import { RabbitmqService } from './rabbitmq.service';
import { AppConfig } from '../app.config';
import type { ConsumeMessage } from 'amqplib';
import * as amqp from 'amqplib';

jest.mock('amqplib');

type ConsumeHandler = (message: ConsumeMessage | null) => void;

type MockChannel = {
  assertExchange: jest.Mock;
  assertQueue: jest.Mock;
  bindQueue: jest.Mock;
  consume: jest.Mock;
  publish: jest.Mock;
  ack: jest.Mock;
  nack: jest.Mock;
};

type MockConnection = {
  createChannel: jest.Mock;
};

describe('RabbitmqService', () => {
  let service: RabbitmqService;
  let mockChannel: MockChannel;
  let mockConnection: MockConnection;
  let consumeCallback: ConsumeHandler | null;

  const mockAppConfig = {
    getRabbitmqUrl: jest.fn(() => 'amqp://guest:guest@localhost:5672'),
    getRabbitmqMessageQueue: jest.fn(() => 'test-queue'),
    getRabbitmqExchange: jest.fn(() => 'message.exchange'),
    getRabbitmqRoutingKey: jest.fn(() => 'routing-message-live-chat-service'),
    getRabbitmqExchangeType: jest.fn(() => 'direct'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    consumeCallback = null;

    mockChannel = {
      assertExchange: jest.fn(),
      assertQueue: jest.fn(),
      bindQueue: jest.fn(),
      consume: jest
        .fn()
        .mockImplementation((_queue: string, cb: ConsumeHandler) => {
          consumeCallback = cb;
        }),
      publish: jest.fn(),
      ack: jest.fn(),
      nack: jest.fn(),
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
    };

    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitmqService,
        {
          provide: AppConfig,
          useValue: mockAppConfig,
        },
      ],
    }).compile();

    service = module.get<RabbitmqService>(RabbitmqService);
    await service.onModuleInit();
  });

  describe('onModuleInit', () => {
    it('should create exchange, queue, binding and consumer', () => {
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'message.exchange',
        'direct',
        { durable: true },
      );
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('test-queue', {
        durable: true,
      });
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'test-queue',
        'message.exchange',
        'routing-message-live-chat-service',
      );
      expect(mockChannel.consume).toHaveBeenCalledWith(
        'test-queue',
        expect.any(Function),
      );
    });
  });

  describe('registerMessageHandler', () => {
    it('should register and call handler when message received', async () => {
      const handler = jest.fn();
      service.registerMessageHandler(handler);

      const consumedMessage = {
        content: Buffer.from(
          JSON.stringify({ uuid: 'u1', roomId: 'r1', content: 'hello' }),
        ),
      } as ConsumeMessage;

      consumeCallback?.(consumedMessage);
      await Promise.resolve();

      expect(handler).toHaveBeenCalledWith({
        uuid: 'u1',
        roomId: 'r1',
        content: 'hello',
      });
    });
  });

  describe('message consumption', () => {
    it('should ack message when JSON payload is valid', async () => {
      service.registerMessageHandler(jest.fn());

      const consumedMessage = {
        content: Buffer.from(
          JSON.stringify({ uuid: 'u1', roomId: 'r1', state: 'created' }),
        ),
      } as ConsumeMessage;

      consumeCallback?.(consumedMessage);
      await Promise.resolve();

      expect(mockChannel.ack).toHaveBeenCalledWith(consumedMessage);
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should nack when payload is not valid JSON', async () => {
      const consumedMessage = {
        content: Buffer.from('{invalid-json'),
      } as ConsumeMessage;

      consumeCallback?.(consumedMessage);
      await Promise.resolve();

      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).toHaveBeenCalledWith(
        consumedMessage,
        false,
        false,
      );
    });

    it('should ignore null message', async () => {
      const handler = jest.fn();
      service.registerMessageHandler(handler);

      consumeCallback?.(null);
      await Promise.resolve();

      expect(handler).not.toHaveBeenCalled();
      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should call handler even without prior registration', async () => {
      const consumedMessage = {
        content: Buffer.from(
          JSON.stringify({ uuid: 'u1', roomId: 'r1', state: 'created' }),
        ),
      } as ConsumeMessage;

      consumeCallback?.(consumedMessage);
      await Promise.resolve();

      expect(mockChannel.ack).toHaveBeenCalledWith(consumedMessage);
    });

    it('should handle error in handler gracefully', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      service.registerMessageHandler(handler);

      const consumedMessage = {
        content: Buffer.from(
          JSON.stringify({ uuid: 'u1', roomId: 'r1', state: 'created' }),
        ),
      } as ConsumeMessage;

      consumeCallback?.(consumedMessage);
      await Promise.resolve();

      expect(handler).toHaveBeenCalled();
      expect(mockChannel.nack).toHaveBeenCalledWith(
        consumedMessage,
        false,
        false,
      );
    });
  });
});
