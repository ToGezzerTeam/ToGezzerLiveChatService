import { Test, TestingModule } from '@nestjs/testing';
import { WsGateway } from './ws.gateway';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';

describe('WsGateway', () => {
  let gateway: WsGateway;
  let rabbitmqService: RabbitmqService;

  const mockClient = {
    emit: jest.fn(),
  } as any;

  const mockRabbitmqService = {
    sendMessage: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsGateway,
        { provide: RabbitmqService, useValue: mockRabbitmqService },
      ],
    }).compile();

    gateway = module.get<WsGateway>(WsGateway);
    rabbitmqService = module.get<RabbitmqService>(RabbitmqService);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should call RabbitmqService.sendMessage and emit response', async () => {
    const message = { text: 'Hello World' };

    await gateway.handleMessage(message, mockClient);

    expect(rabbitmqService.sendMessage).toHaveBeenCalledTimes(1);

    const sentMessage = (rabbitmqService.sendMessage as jest.Mock).mock.calls[0][0];
    expect(sentMessage).toHaveProperty('from', 'LiveChatService');
    expect(sentMessage).toHaveProperty('payload', message);
    expect(sentMessage).toHaveProperty('timestamp');
    expect(typeof sentMessage.timestamp).toBe('number');

    expect(mockClient.emit).toHaveBeenCalledWith('response', { status: 'queued' });
  });
});
