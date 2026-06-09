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

  const mockAppConfig = {
    getRabbitmqUrl: jest.fn(() => 'amqp://guest:guest@localhost:5672'),
    getRabbitmqExchange: jest.fn(() => 'message.exchange'),
    getRabbitmqExchangeType: jest.fn(() => 'direct'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockChannel = {
      assertExchange: jest.fn(),
      assertQueue: jest.fn(),
      bindQueue: jest.fn(),
      consume: jest.fn(),
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
        { provide: AppConfig, useValue: mockAppConfig },
      ],
    }).compile();

    service = module.get<RabbitmqService>(RabbitmqService);
  });
  describe('onModuleInit', () => {
    it('should create exchange only (no bindings)', async () => {
      await service.onModuleInit();

      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'message.exchange',
        'direct',
        { durable: true },
      );
      expect(mockChannel.assertQueue).not.toHaveBeenCalled();
      expect(mockChannel.consume).not.toHaveBeenCalled();
    });

    it('should setup queue for each registered binding', async () => {
      await service.onModuleInit();
      await service.registerQueue('queue-msg', 'routing-msg', jest.fn());
      await service.registerQueue('queue-user', 'routing-user', jest.fn());

      expect(mockChannel.assertQueue).toHaveBeenCalledTimes(2);
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('queue-msg', {
        durable: true,
      });
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('queue-user', {
        durable: true,
      });

      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'queue-msg',
        'message.exchange',
        'routing-msg',
      );
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'queue-user',
        'message.exchange',
        'routing-user',
      );

      expect(mockChannel.consume).toHaveBeenCalledTimes(2);
    });
  });

  describe('message consumption', () => {
    it('should call handler and ack on valid message', async () => {
      const handler = jest.fn();
      const consumeCallbacks: Record<string, ConsumeHandler> = {};

      mockChannel.consume.mockImplementation(
        (queue: string, cb: ConsumeHandler) => {
          consumeCallbacks[queue] = cb;
        },
      );
      await service.onModuleInit();
      await service.registerQueue('queue-msg', 'routing-msg', handler);

      const message = {
        content: Buffer.from(JSON.stringify({ uuid: 'u1', roomId: 'r1' })),
      } as ConsumeMessage;

      consumeCallbacks['queue-msg'](message);
      await Promise.resolve();

      expect(handler).toHaveBeenCalledWith({ uuid: 'u1', roomId: 'r1' });
      expect(mockChannel.ack).toHaveBeenCalledWith(message);
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should nack on invalid JSON', async () => {
      const consumeCallbacks: Record<string, ConsumeHandler> = {};

      mockChannel.consume.mockImplementation(
        (queue: string, cb: ConsumeHandler) => {
          consumeCallbacks[queue] = cb;
        },
      );
      await service.onModuleInit();
      await service.registerQueue('queue-msg', 'routing-msg', jest.fn());

      const message = {
        content: Buffer.from('{invalid-json'),
      } as ConsumeMessage;

      consumeCallbacks['queue-msg'](message);
      await Promise.resolve();

      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('should ignore null message', async () => {
      const handler = jest.fn();
      const consumeCallbacks: Record<string, ConsumeHandler> = {};

      mockChannel.consume.mockImplementation(
        (queue: string, cb: ConsumeHandler) => {
          consumeCallbacks[queue] = cb;
        },
      );
      await service.onModuleInit();
      await service.registerQueue('queue-msg', 'routing-msg', handler);

      consumeCallbacks['queue-msg'](null);
      await Promise.resolve();

      expect(handler).not.toHaveBeenCalled();
      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should nack when handler throws', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const consumeCallbacks: Record<string, ConsumeHandler> = {};

      mockChannel.consume.mockImplementation(
        (queue: string, cb: ConsumeHandler) => {
          consumeCallbacks[queue] = cb;
        },
      );
      await service.onModuleInit();
      await service.registerQueue('queue-msg', 'routing-msg', handler);

      const message = {
        content: Buffer.from(JSON.stringify({ uuid: 'u1' })),
      } as ConsumeMessage;

      consumeCallbacks['queue-msg'](message);
      await Promise.resolve();

      expect(handler).toHaveBeenCalled();
      expect(mockChannel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('should route messages to the correct handler per queue', async () => {
      const handlerMsg = jest.fn();
      const handlerUser = jest.fn();
      const consumeCallbacks: Record<string, ConsumeHandler> = {};

      mockChannel.consume.mockImplementation(
        (queue: string, cb: ConsumeHandler) => {
          consumeCallbacks[queue] = cb;
        },
      );
      await service.onModuleInit();
      await service.registerQueue('queue-msg', 'routing-msg', handlerMsg);
      await service.registerQueue('queue-user', 'routing-user', handlerUser);

      const msgMessage = {
        content: Buffer.from(JSON.stringify({ type: 'message' })),
      } as ConsumeMessage;

      const userMessage = {
        content: Buffer.from(JSON.stringify({ type: 'user' })),
      } as ConsumeMessage;

      consumeCallbacks['queue-msg'](msgMessage);
      consumeCallbacks['queue-user'](userMessage);
      await Promise.resolve();

      expect(handlerMsg).toHaveBeenCalledWith({ type: 'message' });
      expect(handlerUser).toHaveBeenCalledWith({ type: 'user' });
    });
  });
});
