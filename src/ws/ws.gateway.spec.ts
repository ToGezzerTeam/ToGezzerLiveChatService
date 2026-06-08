import { Test, TestingModule } from '@nestjs/testing';
import { WsGateway } from './ws.gateway';
import { WsJwtAuthService } from '../auth/ws-jwt-auth.service';
import type { Socket } from 'socket.io';

describe('WsGateway', () => {
  let gateway: WsGateway;
  const mockClient = {
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
  } as unknown as Socket;

  const mockWsJwtAuthService = {
    authenticateSocket: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
      ],
    }).compile();

    gateway = module.get<WsGateway>(WsGateway);
  });

  function mockServer() {
    const emitMock = jest.fn();
    const serverTo = jest.fn().mockReturnValue({ emit: emitMock });
    (gateway as any).server = { to: serverTo };
    return { serverTo, emitMock };
  }

  describe('handleJoinRoom', () => {
    it('should join socket to room', async () => {
      const roomId = 'room-123';
      const joinMock = jest.spyOn(mockClient, 'join');

      await gateway.handleJoinRoom(roomId, mockClient);

      expect(joinMock).toHaveBeenCalledWith(roomId);
    });
  });

  describe('forwardRabbitMessage', () => {
    it('should forward message to specific room via server.to()', () => {
      const { serverTo, emitMock } = mockServer();

      const message = {
        roomId: 'room-123',
        uuid: 'uuid-1',
        content: { type: 'text', value: 'hello' },
        authorId: 'author-1',
        authorName: 'toto',
        state: 'created',
        createdAt: 12,
      };

      gateway.forwardRabbitMessage(message);

      expect(serverTo).toHaveBeenCalledWith('room-123');
      expect(emitMock).toHaveBeenCalledWith('message', message);
    });

    it('should ignore message without roomId', () => {
      const { serverTo, emitMock } = mockServer();

      const message = {
        uuid: 'uuid-1',
        content: { type: 'text', value: 'hello' },
      };

      gateway.forwardRabbitMessage(message as any);

      expect(serverTo).not.toHaveBeenCalled();
    });

    it('should handle message when server is undefined', () => {
      const message = {
        roomId: 'room-123',
        uuid: 'uuid-1',
        content: { type: 'text', value: 'hello' },
        authorId: 'author-1',
        authorName: 'toto',
        state: 'created',
        createdAt: 12,
      };

      // Should not throw error even if server is undefined
      gateway.forwardRabbitMessage(message);
    });
  });

  describe('forwardToUser', () => {
    it('should forward message to correct user room', () => {
      const { serverTo, emitMock } = mockServer();
      const message = { serverUuid: 'server-1', userId: 'user-1' };
      gateway.forwardToUser(message as any);

      expect(serverTo).toHaveBeenCalledWith('server-1');
      expect(emitMock).toHaveBeenCalledWith('user', message);
    });

    it('should ignore message without serverUuid', () => {
      const emitMock = jest.fn();
      const serverTo = jest.fn().mockReturnValue({
        emit: emitMock,
      });

      gateway.forwardToUser({ userId: 'user-1' } as any);

      expect(serverTo).not.toHaveBeenCalled();
    });
  });

  describe('forwardToRoom', () => {
    it('should forward room event to correct server room', () => {
      const { serverTo, emitMock } = mockServer();
      const message = { serverUuid: 'server-1', roomId: 'room-1' };
      gateway.forwardToRoom(message as any);

      expect(serverTo).toHaveBeenCalledWith('server-1');
      expect(emitMock).toHaveBeenCalledWith('room', message);
    });

    it('should ignore message without serverUuid', () => {
      const emitMock = jest.fn();
      const serverTo = jest.fn().mockReturnValue({
        emit: emitMock,
      });

      gateway.forwardToRoom({ roomId: 'room-1' } as any);

      expect(serverTo).not.toHaveBeenCalled();
    });
  });
});
