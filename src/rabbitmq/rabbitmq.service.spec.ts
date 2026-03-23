import { Test, TestingModule } from '@nestjs/testing';
import { RabbitmqService } from './rabbitmq.service';
import { AppConfig } from '../app.config';
import * as amqp from 'amqplib';

jest.mock('amqplib');

describe('RabbitmqService', () => {
  let service: RabbitmqService;
  let mockChannel: any;
  let mockConnection: any;

  const mockAppConfig = {
    getRabbitmqUrl: jest.fn(() => 'amqp://guest:guest@localhost:5672'),
    getRabbitmqMessageQueue: jest.fn(() => 'test-queue'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockChannel = {
      assertQueue: jest.fn(),
      sendToQueue: jest.fn(),
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call sendToQueue with correct queue and message', async () => {
    const message = { text: 'Hello RabbitMQ' };

    await service.sendMessage(message);

    const expectedBuffer = Buffer.from(JSON.stringify(message));
    expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
      'test-queue',
      expectedBuffer,
    );
  });

  it('should create channel and assert queue on init', async () => {
    expect(mockConnection.createChannel).toHaveBeenCalled();
    expect(mockChannel.assertQueue).toHaveBeenCalledWith('test-queue');
  });
});
