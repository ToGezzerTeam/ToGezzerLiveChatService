import { Test, TestingModule } from '@nestjs/testing';
import type { Socket } from 'socket.io';
import { VoiceChatGateway } from './ws.voice-chat.gateway';
import { MediasoupService } from '../mediasoup/mediasoup.service';

const createMockSocket = (id: string) => {
  const roomEmit = jest.fn();
  return {
    id,
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: roomEmit }),
    disconnect: jest.fn(),
  } as unknown as Socket;
};

const getSocketMocks = (socket: Socket) =>
  socket as unknown as {
    join: jest.Mock;
    leave: jest.Mock;
    emit: jest.Mock;
    to: jest.Mock;
    disconnect: jest.Mock;
  };

describe('VoiceChatGateway', () => {
  let gateway: VoiceChatGateway;
  let mediasoupService: { createRouter: jest.Mock; closeRouter: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mediasoupService = {
      createRouter: jest.fn().mockResolvedValue(undefined),
      closeRouter: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoiceChatGateway,
        { provide: MediasoupService, useValue: mediasoupService },
      ],
    }).compile();

    gateway = module.get<VoiceChatGateway>(VoiceChatGateway);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('disconnecte un client si aucun état utilisateur après timeout', () => {
    const socket = createMockSocket('sock-1');
    const { disconnect } = getSocketMocks(socket);

    gateway.handleConnection(socket);
    jest.advanceTimersByTime(30000);

    expect(disconnect).toHaveBeenCalled();
  });

  it('rejette joinVoiceRoom si roomId ou userId manquant', async () => {
    const socket = createMockSocket('sock-1');
    const { emit } = getSocketMocks(socket);

    await gateway.handleJoinVoiceRoom(socket, { roomId: '', userId: 'u1' });

    expect(emit).toHaveBeenCalledWith('error', {
      message: 'roomId and userId are required',
    });
  });

  it('rejoint une room et notifie les autres utilisateurs', async () => {
    const socket = createMockSocket('sock-1');
    const { join, to, emit } = getSocketMocks(socket);

    await gateway.handleJoinVoiceRoom(socket, {
      roomId: 'room-1',
      userId: 'user-1',
    });

    expect(join).toHaveBeenCalledWith('room-1');
    expect(mediasoupService.createRouter).toHaveBeenCalledWith('room-1');
    expect(to).toHaveBeenCalledWith('room-1');
    expect(emit).toHaveBeenCalledWith('joinedVoiceRoom', {
      success: true,
      existingUsers: [
        {
          socketId: 'sock-1',
          userId: 'user-1',
          isMicMuted: false,
          isSongMuted: false,
        },
      ],
    });
  });

  it('rejoint une room existante sans recreer le router', async () => {
    const socket = createMockSocket('sock-1');
    const { join } = getSocketMocks(socket);
    (
      gateway as unknown as { roomUsers: Map<string, Set<string>> }
    ).roomUsers.set('room-1', new Set(['sock-other']));

    await gateway.handleJoinVoiceRoom(socket, {
      roomId: 'room-1',
      userId: 'user-1',
    });

    expect(join).toHaveBeenCalledWith('room-1');
    expect(mediasoupService.createRouter).not.toHaveBeenCalled();
  });

  it('emets une erreur si joinVoiceRoom echoue', async () => {
    const socket = createMockSocket('sock-1');
    const { emit } = getSocketMocks(socket);
    mediasoupService.createRouter.mockRejectedValue(new Error('boom'));

    await gateway.handleJoinVoiceRoom(socket, {
      roomId: 'room-1',
      userId: 'user-1',
    });

    expect(emit).toHaveBeenCalledWith('error', {
      message: 'Failed to join voice room',
    });
  });

  it('met a jour l etat micro et diffuse aux utilisateurs', () => {
    const socket = createMockSocket('sock-1');
    const emitMock = jest.fn();
    (gateway as unknown as { server: { to: jest.Mock } }).server = {
      to: jest.fn().mockReturnValue({ emit: emitMock }),
    };

    (gateway as unknown as { userStates: Map<string, unknown> }).userStates.set(
      'sock-1',
      {
        socketId: 'sock-1',
        userId: 'user-1',
        roomId: 'room-1',
        isMicMuted: false,
        isSongMuted: false,
      },
    );

    gateway.handleToggleMic(socket, { isMuted: true });

    expect(emitMock).toHaveBeenCalledWith('userMediaStateChanged', {
      socketId: 'sock-1',
      userId: 'user-1',
      isMicMuted: true,
      isSongMuted: false,
    });
  });

  it('met a jour l etat song et diffuse aux utilisateurs', () => {
    const socket = createMockSocket('sock-1');
    const emitMock = jest.fn();
    (gateway as unknown as { server: { to: jest.Mock } }).server = {
      to: jest.fn().mockReturnValue({ emit: emitMock }),
    };

    (gateway as unknown as { userStates: Map<string, unknown> }).userStates.set(
      'sock-1',
      {
        socketId: 'sock-1',
        userId: 'user-1',
        roomId: 'room-1',
        isMicMuted: false,
        isSongMuted: false,
      },
    );

    gateway.handleToggleCamera(socket, { isMuted: true });

    expect(emitMock).toHaveBeenCalledWith('userMediaStateChanged', {
      socketId: 'sock-1',
      userId: 'user-1',
      isMicMuted: false,
      isSongMuted: true,
    });
  });

  it('ferme le router quand le dernier utilisateur quitte', () => {
    const socket = createMockSocket('sock-1');
    const emitMock = jest.fn();
    (gateway as unknown as { server: { to: jest.Mock } }).server = {
      to: jest.fn().mockReturnValue({ emit: emitMock }),
    };

    (gateway as unknown as { userStates: Map<string, unknown> }).userStates.set(
      'sock-1',
      {
        socketId: 'sock-1',
        userId: 'user-1',
        roomId: 'room-1',
        isMicMuted: false,
        isSongMuted: false,
      },
    );
    (
      gateway as unknown as { roomUsers: Map<string, Set<string>> }
    ).roomUsers.set('room-1', new Set(['sock-1']));

    gateway.handleDisconnect(socket);

    expect(mediasoupService.closeRouter).toHaveBeenCalledWith('room-1');
    expect(emitMock).toHaveBeenCalledWith('userLeft', {
      socketId: 'sock-1',
      userId: 'user-1',
    });
  });

  it('quitte la room et notifie les autres utilisateurs', async () => {
    const socket = createMockSocket('sock-1');
    const { leave } = getSocketMocks(socket);
    const emitMock = jest.fn();
    (gateway as unknown as { server: { to: jest.Mock } }).server = {
      to: jest.fn().mockReturnValue({ emit: emitMock }),
    };

    (gateway as unknown as { userStates: Map<string, unknown> }).userStates.set(
      'sock-1',
      {
        socketId: 'sock-1',
        userId: 'user-1',
        roomId: 'room-1',
        isMicMuted: false,
        isSongMuted: false,
      },
    );
    (
      gateway as unknown as { roomUsers: Map<string, Set<string>> }
    ).roomUsers.set('room-1', new Set(['sock-1']));

    await gateway.handleLeaveVoiceRoom(socket);

    expect(leave).toHaveBeenCalledWith('room-1');
    expect(mediasoupService.closeRouter).toHaveBeenCalledWith('room-1');
    expect(emitMock).toHaveBeenCalledWith('userLeft', {
      socketId: 'sock-1',
      userId: 'user-1',
    });
  });

  it('ignore toggleMic si userState absent', () => {
    const socket = createMockSocket('sock-1');
    const emitMock = jest.fn();
    (gateway as unknown as { server: { to: jest.Mock } }).server = {
      to: jest.fn().mockReturnValue({ emit: emitMock }),
    };

    gateway.handleToggleMic(socket, { isMuted: true });

    expect(emitMock).not.toHaveBeenCalled();
  });

  it('ignore toggleSong si userState absent', () => {
    const socket = createMockSocket('sock-1');
    const emitMock = jest.fn();
    (gateway as unknown as { server: { to: jest.Mock } }).server = {
      to: jest.fn().mockReturnValue({ emit: emitMock }),
    };

    gateway.handleToggleCamera(socket, { isMuted: true });

    expect(emitMock).not.toHaveBeenCalled();
  });

  it('ignore leaveVoiceRoom si userState absent', async () => {
    const socket = createMockSocket('sock-1');
    const { leave } = getSocketMocks(socket);

    await gateway.handleLeaveVoiceRoom(socket);

    expect(leave).not.toHaveBeenCalled();
  });

  it('ne ferme pas le router si la room garde des utilisateurs', () => {
    const socket = createMockSocket('sock-1');
    const emitMock = jest.fn();
    (gateway as unknown as { server: { to: jest.Mock } }).server = {
      to: jest.fn().mockReturnValue({ emit: emitMock }),
    };

    (gateway as unknown as { userStates: Map<string, unknown> }).userStates.set(
      'sock-1',
      {
        socketId: 'sock-1',
        userId: 'user-1',
        roomId: 'room-1',
        isMicMuted: false,
        isSongMuted: false,
      },
    );
    (
      gateway as unknown as { roomUsers: Map<string, Set<string>> }
    ).roomUsers.set('room-1', new Set(['sock-1', 'sock-2']));

    gateway.handleDisconnect(socket);

    expect(mediasoupService.closeRouter).not.toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith('userLeft', {
      socketId: 'sock-1',
      userId: 'user-1',
    });
  });
});
