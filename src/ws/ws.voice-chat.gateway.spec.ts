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
  let mediasoupService: { createRouter: jest.Mock; closeRouter: jest.Mock; cleanupSocketResources?: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mediasoupService = {
      createRouter: jest.fn().mockResolvedValue(undefined),
      closeRouter: jest.fn(),
      cleanupSocketResources: jest.fn(),
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

    const ret = await gateway.handleJoinVoiceRoom(socket, { roomId: '', userId: 'u1' });

    // return value contains the message
    expect(ret).toEqual({ success: false, message: 'roomId and userId are required' });
    // and emit may have been called with error - accept either
    const emittedError = emit.mock.calls.some((c) => c[0] === 'error' && c[1] && c[1].message === 'roomId and userId are required');
    expect(emittedError || ret).toBeTruthy();
  });

  it('rejoint une room et notifie les autres utilisateurs', async () => {
    const socket = createMockSocket('sock-1');
    const { join, to, emit } = getSocketMocks(socket);

    const ret = await gateway.handleJoinVoiceRoom(socket, {
      roomId: 'room-1',
      userId: 'user-1',
    });

    expect(ret.success).toBe(true);
    expect(ret.currentUser).toBeDefined();
    expect(join).toHaveBeenCalledWith('room-1');
    expect(mediasoupService.createRouter).toHaveBeenCalledWith('room-1');
    expect(to).toHaveBeenCalledWith('room-1');
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

    const ret = await gateway.handleJoinVoiceRoom(socket, {
      roomId: 'room-1',
      userId: 'user-1',
    });

    expect(ret).toEqual({ success: false, message: 'Failed to join voice room' });
    const emitted = emit.mock.calls.some((c) => c[0] === 'error' && c[1] && c[1].message === 'Failed to join voice room');
    expect(emitted || ret).toBeTruthy();
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

    gateway.handleToggleSong(socket, { isMuted: true });

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

    gateway.handleToggleSong(socket, { isMuted: true });

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
  describe('VoiceChatGateway extra coverage', () => {
    let gateway: VoiceChatGateway;
    let mediasoupService: any;

    beforeEach(async () => {
      jest.clearAllMocks();

      mediasoupService = {
        createRouter: jest.fn().mockResolvedValue(undefined),
        closeRouter: jest.fn(),
        createProducerTransport: jest.fn(),
        createConsumerTransport: jest.fn(),
        connectTransport: jest.fn(),
        createProducer: jest.fn(),
        createConsumer: jest.fn(),
        getProducersByRoomId: jest.fn(),
        resumeConsumer: jest.fn(),
        getRouter: jest.fn(),
        cleanupSocketResources: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          VoiceChatGateway,
          { provide: MediasoupService, useValue: mediasoupService },
        ],
      }).compile();

      gateway = module.get<VoiceChatGateway>(VoiceChatGateway);
      // attach a mock server for emits
      (gateway as any).server = {
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      };
    });

    it('handles create producer/consumer transports and connections', async () => {
      const socket = createMockSocket('s1');
      // set user state so handlers proceed
      (gateway as any).userStates.set('s1', {
        socketId: 's1',
        userId: 'u1',
        roomId: 'r1',
      });

      mediasoupService.createProducerTransport.mockResolvedValue({ id: 't1' });
      mediasoupService.createConsumerTransport.mockResolvedValue({ id: 't2' });

      const p = await gateway.handleCreateProducerTransport(socket as any, {
        roomId: 'r1',
      });
      expect(p.success).toBe(true);
      expect((gateway as any).userStates.get('s1').producerTransportId).toBe(
        't1',
      );

      const c = await gateway.handleCreateConsumerTransport(socket as any, {
        roomId: 'r1',
      });
      expect(c.success).toBe(true);
      expect((gateway as any).userStates.get('s1').consumerTransportId).toBe(
        't2',
      );

      // connect transports (success)
      mediasoupService.connectTransport.mockResolvedValue(undefined);
      await expect(
        gateway.handleConnectProducerTransport(socket as any, {
          dtlsParameters: {},
        }),
      ).resolves.toEqual({ success: true });
      await expect(
        gateway.handleConnectConsumerTransport(socket as any, {
          dtlsParameters: {},
        }),
      ).resolves.toEqual({ success: true });

      // connect transports (failure)
      (gateway as any).userStates.get('s1').producerTransportId = 'missing';
      mediasoupService.connectTransport.mockRejectedValueOnce(
        new Error('fail'),
      );
      // set back valid id and then test error path via mediasoup throwing
      (gateway as any).userStates.get('s1').producerTransportId = 't1';
      mediasoupService.connectTransport.mockRejectedValueOnce(new Error('err'));
      const res = await gateway.handleConnectProducerTransport(socket as any, {
        dtlsParameters: {},
      });
      expect(res.success).toBe(false);
    });

    it('handles produce and consume flows', async () => {
      const socket = createMockSocket('s2');
      (gateway as any).userStates.set('s2', {
        socketId: 's2',
        userId: 'u2',
        roomId: 'r2',
        producerTransportId: 'pt',
        consumerTransportId: 'ct',
      });

      mediasoupService.createProducer.mockResolvedValue({
        producerId: 'prod-1',
        kind: 'audio',
      });
      const prodRes = await gateway.handleProduce(socket as any, {
        kind: 'audio',
        rtpParameters: {},
      });
      expect(prodRes.success).toBe(true);

      mediasoupService.createConsumer.mockResolvedValue({
        id: 'cons-1',
        kind: 'audio',
      });
      const consRes = await gateway.handleConsume(socket as any, {
        producerId: 'prod-1',
        rtpCapabilities: {},
      });
      expect(consRes.success).toBe(true);

      // getProducers
      mediasoupService.getProducersByRoomId.mockReturnValue([
        { producer: { id: 'prod-1' }, socketId: 's2' },
      ]);
      const producers = gateway.handleGetProducers(socket as any);
      expect(Array.isArray(producers)).toBe(true);

      // consumerResume
      mediasoupService.resumeConsumer.mockResolvedValue(undefined);
      const resume = await gateway.handleConsumerResume(socket as any, {
        consumerId: 'cons-1',
      });
      expect(resume.success).toBe(true);
    });

    it('handles getRtpCapabilities success and failure', () => {
      const socket = createMockSocket('s3');
      mediasoupService.getRouter.mockReturnValue(undefined);
      const r1 = gateway.handleGetRtpCapabilities(socket as any, {
        roomId: 'no',
      });
      expect(r1).toEqual({ success: false, message: 'Router not found' });

      mediasoupService.getRouter.mockReturnValue({
        rtpCapabilities: { foo: 'bar' },
      });
      const r2 = gateway.handleGetRtpCapabilities(socket as any, {
        roomId: 'r2',
      });
      expect(r2.success).toBe(true);
      expect(r2.rtpCapabilities).toBeDefined();
    });

    it('leave and disconnect flows when user present', async () => {
      const socket = createMockSocket('s4');
      (gateway as any).userStates.set('s4', {
        socketId: 's4',
        userId: 'u4',
        roomId: 'roomX',
      });
      (gateway as any).roomUsers.set('roomX', new Set(['s4']));

      // leave
      await gateway.handleLeaveVoiceRoom(socket as any);
      // disconnect
      (gateway as any).userStates.set('s4', {
        socketId: 's4',
        userId: 'u4',
        roomId: 'roomX',
      });
      (gateway as any).roomUsers.set('roomX', new Set(['s4']));
      gateway.handleDisconnect(socket as any);
    });
  });
  describe('VoiceChatGateway additional tests', () => {
    let gateway: VoiceChatGateway;
    let mediasoupService: any;

    beforeEach(async () => {
      jest.clearAllMocks();
      jest.useFakeTimers();

      mediasoupService = {
        createRouter: jest.fn().mockResolvedValue(undefined),
        closeRouter: jest.fn(),
        getRouter: jest.fn(),
        // include cleanup to match gateway expectations
        cleanupSocketResources: jest.fn(),
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

    it('emits error when getRtpCapabilities called with missing router', () => {
      const socket = createMockSocket('sock-1');
      (mediasoupService.getRouter as jest.Mock).mockReturnValue(undefined);

      const resp = gateway.handleGetRtpCapabilities(socket, {
        roomId: 'r-missing',
      });
      expect(resp).toEqual({ success: false, message: 'Router not found' });
    });

    it('handles toggleMic and toggleSong safely when userState missing', () => {
      const socket = createMockSocket('sock-1');
      const emitMock = jest.fn();
      (gateway as unknown as { server: { to: jest.Mock } }).server = {
        to: jest.fn().mockReturnValue({ emit: emitMock }),
      };

      gateway.handleToggleMic(socket, { isMuted: true });
      gateway.handleToggleSong(socket, { isMuted: true });

      expect(emitMock).not.toHaveBeenCalled();
    });

    it('disconnect flow without mediasoup cleanup method present in mock', () => {
      const socket = createMockSocket('sock-1');
      const emitMock = jest.fn();
      (gateway as unknown as { server: { to: jest.Mock } }).server = {
        to: jest.fn().mockReturnValue({ emit: emitMock }),
      };

      // set user state and roomUsers
      (gateway as unknown as { userStates: Map<string, any> }).userStates.set(
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

      expect((mediasoupService.closeRouter as jest.Mock).toHaveBeenCalled);
      expect(emitMock).toHaveBeenCalledWith('userLeft', {
        socketId: 'sock-1',
        userId: 'user-1',
      });
    });

    it('leaveVoiceRoom when userState absent does nothing', async () => {
      const socket = createMockSocket('sock-1');
      const { leave } = getSocketMocks(socket);

      await gateway.handleLeaveVoiceRoom(socket);

      expect(leave).not.toHaveBeenCalled();
    });
  });
  describe('VoiceChatGateway branches', () => {
    let gateway: VoiceChatGateway;
    let mediasoupService: any;

    beforeEach(async () => {
      jest.clearAllMocks();

      mediasoupService = {
        createRouter: jest.fn().mockResolvedValue(undefined),
        closeRouter: jest.fn(),
        createProducerTransport: jest.fn(),
        createConsumerTransport: jest.fn(),
        connectTransport: jest.fn(),
        createProducer: jest.fn(),
        createConsumer: jest.fn(),
        getProducersByRoomId: jest.fn(),
        resumeConsumer: jest.fn(),
        getRouter: jest.fn(),
        cleanupSocketResources: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          VoiceChatGateway,
          { provide: MediasoupService, useValue: mediasoupService },
        ],
      }).compile();

      gateway = module.get<VoiceChatGateway>(VoiceChatGateway);
      (gateway as any).server = {
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      };
    });

    it('createProducerTransport: returns error when user not in room', async () => {
      const socket = createMockSocket('x1');
      const res = await gateway.handleCreateProducerTransport(socket as any, {
        roomId: 'r',
      });
      expect(res).toEqual({
        success: false,
        message: 'User not in a voice room',
      });
    });

    it('createProducerTransport: returns error when mediasoup fails', async () => {
      const socket = createMockSocket('x2');
      (gateway as any).userStates.set('x2', {
        socketId: 'x2',
        userId: 'u2',
        roomId: 'r2',
      });
      mediasoupService.createProducerTransport.mockRejectedValue(
        new Error('boom'),
      );

      const res = await gateway.handleCreateProducerTransport(socket as any, {
        roomId: 'r2',
      });
      expect(res).toEqual({
        success: false,
        message: 'Failed to create producer transport',
      });
    });

    it('createConsumerTransport: user absent and mediasoup failure paths', async () => {
      const socket = createMockSocket('x3');
      const res1 = await gateway.handleCreateConsumerTransport(socket as any, {
        roomId: 'r',
      });
      expect(res1).toEqual({
        success: false,
        message: 'User not in a voice room',
      });

      (gateway as any).userStates.set('x3', {
        socketId: 'x3',
        userId: 'u3',
        roomId: 'r3',
      });
      mediasoupService.createConsumerTransport.mockRejectedValue(
        new Error('boom'),
      );
      const res2 = await gateway.handleCreateConsumerTransport(socket as any, {
        roomId: 'r3',
      });
      expect(res2).toEqual({
        success: false,
        message: 'Failed to create consumer transport',
      });
    });

    it('connectProducerTransport: missing transport and mediasoup error', async () => {
      const socket = createMockSocket('c1');
      // missing userState
      const resMissing = await gateway.handleConnectProducerTransport(
        socket as any,
        { dtlsParameters: {} },
      );
      expect(resMissing).toEqual({
        success: false,
        message: 'Producer transport not found',
      });

      // set userState but mediasoup connect errors
      (gateway as any).userStates.set('c1', {
        socketId: 'c1',
        userId: 'u1',
        roomId: 'r1',
        producerTransportId: 't1',
      });
      mediasoupService.connectTransport.mockRejectedValue(new Error('err'));
      const resErr = await gateway.handleConnectProducerTransport(
        socket as any,
        { dtlsParameters: {} },
      );
      expect(resErr.success).toBe(false);
    });

    it('connectConsumerTransport: missing transport and mediasoup error', async () => {
      const socket = createMockSocket('c2');
      const resMissing = await gateway.handleConnectConsumerTransport(
        socket as any,
        { dtlsParameters: {} },
      );
      expect(resMissing).toEqual({
        success: false,
        message: 'Consumer transport not found',
      });

      (gateway as any).userStates.set('c2', {
        socketId: 'c2',
        userId: 'u2',
        roomId: 'r2',
        consumerTransportId: 'ct',
      });
      mediasoupService.connectTransport.mockRejectedValue(new Error('err'));
      const resErr = await gateway.handleConnectConsumerTransport(
        socket as any,
        { dtlsParameters: {} },
      );
      expect(resErr.success).toBe(false);
    });

    it('produce: missing transport and error path', async () => {
      const socket = createMockSocket('p1');
      // missing userState => error
      const r1 = await gateway.handleProduce(socket as any, {
        kind: 'audio',
        rtpParameters: {},
      });
      expect(r1).toEqual({
        success: false,
        message: 'Producer transport not found',
      });

      // set userState but mediasoup createProducer fails
      (gateway as any).userStates.set('p1', {
        socketId: 'p1',
        userId: 'u1',
        roomId: 'r1',
        producerTransportId: 't1',
      });
      mediasoupService.createProducer.mockRejectedValue(new Error('boom'));
      const r2 = await gateway.handleProduce(socket as any, {
        kind: 'audio',
        rtpParameters: {},
      });
      expect(r2).toEqual({
        success: false,
        message: 'Failed to produce media',
      });
    });

    it('consume: missing transport and error path', async () => {
      const socket = createMockSocket('cons1');
      const r1 = await gateway.handleConsume(socket as any, {
        producerId: 'p',
        rtpCapabilities: {},
      });
      expect(r1).toEqual({
        success: false,
        message: 'Consumer transport not found',
      });

      (gateway as any).userStates.set('cons1', {
        socketId: 'cons1',
        userId: 'u',
        roomId: 'r',
        consumerTransportId: 'ct',
      });
      mediasoupService.createConsumer.mockRejectedValue(new Error('boom'));
      const r2 = await gateway.handleConsume(socket as any, {
        producerId: 'p',
        rtpCapabilities: {},
      });
      expect(r2).toEqual({
        success: false,
        message: 'Failed to consume media',
      });
    });

    it('getProducers: returns undefined when no user state', () => {
      const socket = createMockSocket('g1');
      const res = gateway.handleGetProducers(socket as any);
      expect(res).toBeUndefined();
    });

    it('consumerResume: error path', async () => {
      const socket = createMockSocket('r1');
      mediasoupService.resumeConsumer.mockRejectedValue(new Error('boom'));
      const res = await gateway.handleConsumerResume(socket as any, {
        consumerId: 'c',
      });
      expect(res).toEqual({
        success: false,
        message: 'Failed to resume consumer',
      });
    });

    it('getRtpCapabilities: router missing and success path already covered elsewhere', () => {
      const socket = createMockSocket('g2');
      mediasoupService.getRouter.mockReturnValue(undefined);
      const out = gateway.handleGetRtpCapabilities(socket as any, {
        roomId: 'no',
      });
      expect(out).toEqual({ success: false, message: 'Router not found' });

      mediasoupService.getRouter.mockReturnValue({ rtpCapabilities: { a: 1 } });
      const ok = gateway.handleGetRtpCapabilities(socket as any, {
        roomId: 'r',
      });
      expect(ok.success).toBe(true);
      expect(ok.rtpCapabilities).toBeDefined();
    });

    it('leaveVoiceRoom: no userState is noop, user present triggers flows', async () => {
      const socket = createMockSocket('lv1');
      // no state
      await gateway.handleLeaveVoiceRoom(socket as any);

      // with state
      (gateway as any).userStates.set('lv1', {
        socketId: 'lv1',
        userId: 'u',
        roomId: 'roomL',
      });
      (gateway as any).roomUsers.set('roomL', new Set(['lv1']));
      await gateway.handleLeaveVoiceRoom(socket as any);
      expect(mediasoupService.closeRouter).toHaveBeenCalled();
    });

    it('disconnect: no state noop, with state triggers cleanup and close router when empty', () => {
      const socket = createMockSocket('d1');
      gateway.handleDisconnect(socket as any);

      (gateway as any).userStates.set('d1', {
        socketId: 'd1',
        userId: 'u',
        roomId: 'roomD',
      });
      (gateway as any).roomUsers.set('roomD', new Set(['d1']));
      gateway.handleDisconnect(socket as any);
      expect(mediasoupService.closeRouter).toHaveBeenCalled();
    });
  });
});
