import { Test, TestingModule } from '@nestjs/testing';
import { WsGateway } from './ws.gateway';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { WsJwtAuthService } from '../auth/ws-jwt-auth.service';
import type { Socket } from 'socket.io';

describe('WsGateway', () => {
  let gateway: WsGateway;
  let rabbitMessageHandler: ((message: unknown) => Promise<void> | void) | null;

  const mockClient = {
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
  } as unknown as Socket;

  const mockRabbitmqService = {
    sendMessage: jest.fn(),
    registerMessageHandler: jest.fn(
      (handler: (message: unknown) => Promise<void> | void) => {
        rabbitMessageHandler = handler;
      },
    ),
  };
  const mockWsJwtAuthService = {
    authenticateSocket: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    rabbitMessageHandler = null;

    mockWsJwtAuthService.authenticateSocket.mockReturnValue({
      uuid: 'user-1',
      username: 'testuser',
      email: 'test@test.com',
      id: 1,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsGateway,
        { provide: WsJwtAuthService, useValue: mockWsJwtAuthService },
        { provide: RabbitmqService, useValue: mockRabbitmqService },
      ],
    }).compile();

    gateway = module.get<WsGateway>(WsGateway);
  });

  describe('onModuleInit', () => {
    it('should register RabbitMQ message handler on init', () => {
      gateway.onModuleInit();
      expect(mockRabbitmqService.registerMessageHandler).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });
  });

  describe('handleJoinRoom', () => {
    it('should join socket to room', async () => {
      const roomId = 'room-123';
      const joinMock = jest.spyOn(mockClient, 'join');

      await gateway.handleJoinRoom(roomId, mockClient);

      expect(joinMock).toHaveBeenCalledWith(roomId);
    });
  });

  describe('forwardRabbitMessage', () => {
    it('should forward message to specific room via server.to()', async () => {
      const emitMock = jest.fn();
      const serverTo = jest.fn().mockReturnValue({
        emit: emitMock,
      });
      (
        gateway as unknown as {
          server: { to: (roomId: string) => { emit: jest.Mock } };
        }
      ).server = {
        to: serverTo,
      };

      gateway.onModuleInit();

      const message = {
        roomId: 'room-123',
        uuid: 'uuid-1',
        content: { type: 'text', value: 'hello' },
      };

      await rabbitMessageHandler?.(message);

      expect(serverTo).toHaveBeenCalledWith('room-123');
      expect(emitMock).toHaveBeenCalledWith('message', message);
    });

    it('should ignore message without roomId', async () => {
      const serverTo = jest.fn();
      (
        gateway as unknown as {
          server: { to: (roomId: string) => void };
        }
      ).server = {
        to: serverTo,
      };

      gateway.onModuleInit();

      const message = {
        uuid: 'uuid-1',
        content: { type: 'text', value: 'hello' },
      };

      await rabbitMessageHandler?.(message);

      expect(serverTo).not.toHaveBeenCalled();
    });

    it('should handle message when server is undefined', async () => {
      gateway.onModuleInit();

      const message = {
        roomId: 'room-123',
        uuid: 'uuid-1',
        content: { type: 'text', value: 'hello' },
      };

      // Should not throw error even if server is undefined
      await rabbitMessageHandler?.(message);
    });
  });
});
