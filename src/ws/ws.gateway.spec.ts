import { Test, TestingModule } from '@nestjs/testing';
import { WsGateway } from './ws.gateway';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import type { Socket } from 'socket.io';

type SentMessage = {
  createdAt: number;
  roomId?: string;
  authorId?: string;
  answerTo?: string;
  uuid?: string;
  state?: string;
  content?: {
    type?: string;
    value?: string;
  };
};

describe('WsGateway', () => {
  let gateway: WsGateway;

  const emitMock = jest.fn();
  const mockClient = {
    emit: jest.fn(),
  } as unknown as Socket;

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
    (mockClient.emit as unknown as jest.Mock) = emitMock;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should call RabbitmqService.sendMessage and emit response', async () => {
    const message = {
      roomId: 'room-123',
      authorId: 'author-1',
      state: 'created',
      content: { type: 'text', value: 'Hello World' },
    };

    await gateway.handleMessage(message, mockClient);

    expect(mockRabbitmqService.sendMessage).toHaveBeenCalledTimes(1);

    const firstCall = mockRabbitmqService.sendMessage.mock.calls[0] as [
      SentMessage,
    ];
    const sentMessage = firstCall?.[0];
    expect(sentMessage).toBeDefined();
    expect(sentMessage?.roomId).toBe('room-123');
    expect(sentMessage?.authorId).toBe('author-1');
    expect(sentMessage?.state).toBe('created');
    expect(sentMessage?.content).toEqual({
      type: 'text',
      value: 'Hello World',
    });
    expect(typeof sentMessage?.createdAt).toBe('number');
    expect(typeof sentMessage?.uuid).toBe('string');
    expect(sentMessage?.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    expect(emitMock).toHaveBeenCalledWith('response', {
      status: 'queued',
      uuid: sentMessage?.uuid,
    });
  });
});
