import { Test, TestingModule } from '@nestjs/testing';
import { RabbitmqModule } from './rabbitmq.module';
import { RabbitmqService } from './rabbitmq.service';
import { WsGateway } from '../ws/ws.gateway';
import { AppConfig } from '../app.config';

describe('RabbitmqModule', () => {
  let rabbitmqModule: RabbitmqModule;
  let mockRabbitmq: { registerQueue: jest.Mock };
  let mockGateway: {
    forwardRabbitMessage: jest.Mock;
    forwardToUser: jest.Mock;
    forwardToRoom: jest.Mock;
  };
  let mockConfig: {
    getRabbitmqMessageQueue: jest.Mock;
    getRabbitmqUserQueue: jest.Mock;
    getRabbitmqRoomQueue: jest.Mock;
  };

  beforeEach(async () => {
    mockRabbitmq = { registerQueue: jest.fn() };

    mockGateway = {
      forwardRabbitMessage: jest.fn(),
      forwardToUser: jest.fn(),
      forwardToRoom: jest.fn(),
    };

    mockConfig = {
      getRabbitmqMessageQueue: jest.fn(() => ({
        queue: 'queue-msg',
        routingKey: 'routing-msg',
      })),
      getRabbitmqUserQueue: jest.fn(() => ({
        queue: 'queue-user',
        routingKey: 'routing-user',
      })),
      getRabbitmqRoomQueue: jest.fn(() => ({
        queue: 'queue-room',
        routingKey: 'routing-room',
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitmqModule,
        { provide: RabbitmqService, useValue: mockRabbitmq },
        { provide: WsGateway, useValue: mockGateway },
        { provide: AppConfig, useValue: mockConfig },
      ],
    }).compile();

    rabbitmqModule = module.get<RabbitmqModule>(RabbitmqModule);
    rabbitmqModule.onModuleInit();
  });

  it('should be defined', () => {
    expect(rabbitmqModule).toBeDefined();
  });

  it('should register 3 queues on init', () => {
    expect(mockRabbitmq.registerQueue).toHaveBeenCalledTimes(3);
  });

  it('should register message queue with correct queue and routingKey', () => {
    expect(mockRabbitmq.registerQueue).toHaveBeenCalledWith(
      'queue-msg',
      'routing-msg',
      expect.any(Function),
    );
  });

  it('should register user queue with correct queue and routingKey', () => {
    expect(mockRabbitmq.registerQueue).toHaveBeenCalledWith(
      'queue-user',
      'routing-user',
      expect.any(Function),
    );
  });

  it('should register room queue with correct queue and routingKey', () => {
    expect(mockRabbitmq.registerQueue).toHaveBeenCalledWith(
      'queue-room',
      'routing-room',
      expect.any(Function),
    );
  });

  it('should forward message queue payload to gateway.forwardRabbitMessage', () => {
    const [, , handler] = mockRabbitmq.registerQueue.mock.calls[0];
    const payload = { roomId: 'r1', content: 'hello' };
    handler(payload);
    expect(mockGateway.forwardRabbitMessage).toHaveBeenCalledWith(payload);
  });

  it('should forward user queue payload to gateway.forwardToUser', () => {
    const [, , handler] = mockRabbitmq.registerQueue.mock.calls[1];
    const payload = { serverUuid: 's1', userId: 'u1' };
    handler(payload);
    expect(mockGateway.forwardToUser).toHaveBeenCalledWith(payload);
  });

  it('should forward room queue payload to gateway.forwardToRoom', () => {
    const [, , handler] = mockRabbitmq.registerQueue.mock.calls[2];
    const payload = { serverUuid: 's1', roomId: 'r1' };
    handler(payload);
    expect(mockGateway.forwardToRoom).toHaveBeenCalledWith(payload);
  });
});
