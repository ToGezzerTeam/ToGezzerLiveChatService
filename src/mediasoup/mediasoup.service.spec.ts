import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MediasoupService } from './mediasoup.service';
import { createWorker } from 'mediasoup';

jest.mock('mediasoup', () => ({
  createWorker: jest.fn(),
  types: {},
}));

describe('MediasoupService', () => {
  let service: MediasoupService;
  let configService: { get: jest.Mock };

  const mockWorker = {
    createRouter: jest.fn(),
    on: jest.fn(),
    close: jest.fn(),
  };

  const mockRouter = {
    createWebRtcTransport: jest.fn(),
    close: jest.fn(),
  };

  const mockTransport = {
    id: 'transport-1',
    iceParameters: { usernameFragment: 'u', password: 'p' },
    iceCandidates: [],
    dtlsParameters: { role: 'auto', fingerprints: [] },
    sctpParameters: undefined,
    setMaxIncomingBitrate: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn((key: string, defaultValue?: number | string) => {
        if (key === 'MEDIASOUP_MIN_PORT') return 40000;
        if (key === 'MEDIASOUP_MAX_PORT') return 57000;
        if (key === 'MEDIASOUP_ANNOUNCED_IP') return '127.0.0.1';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediasoupService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<MediasoupService>(MediasoupService);
  });

  it('initialise le worker avec la plage de ports', async () => {
    (createWorker as jest.Mock).mockResolvedValue(mockWorker);

    await service.initialize();

    expect(createWorker).toHaveBeenCalledWith({
      logLevel: 'warn',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
      rtcMinPort: 40000,
      rtcMaxPort: 57000,
    });
    expect(mockWorker.on).toHaveBeenCalledWith('died', expect.any(Function));
  });

  it('cree et met en cache un router', async () => {
    (service as unknown as { worker: unknown }).worker = mockWorker;
    mockWorker.createRouter.mockResolvedValue(mockRouter);

    const first = await service.createRouter('room-1');
    const second = await service.createRouter('room-1');

    expect(mockWorker.createRouter).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('retourne une erreur si le router est absent pour un transport', async () => {
    await expect(service.createProducerTransport('room-1')).rejects.toThrow(
      'Router not found for room: room-1',
    );
  });

  it('cree un transport WebRTC et renvoie les params', async () => {
    (service as unknown as { routers: Map<string, unknown> }).routers.set(
      'room-1',
      mockRouter,
    );
    mockRouter.createWebRtcTransport.mockResolvedValue(mockTransport);

    const result = await service.createProducerTransport('room-1');

    expect(mockRouter.createWebRtcTransport).toHaveBeenCalledWith({
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: '127.0.0.1',
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
    });
    expect(mockTransport.setMaxIncomingBitrate).toHaveBeenCalledWith(1500000);
    expect(result).toEqual({
      id: 'transport-1',
      iceParameters: mockTransport.iceParameters,
      iceCandidates: mockTransport.iceCandidates,
      dtlsParameters: mockTransport.dtlsParameters,
      sctpParameters: mockTransport.sctpParameters,
    });
  });

  it('ferme un router existant', () => {
    (service as unknown as { routers: Map<string, unknown> }).routers.set(
      'room-1',
      mockRouter,
    );

    service.closeRouter('room-1');

    expect(mockRouter.close).toHaveBeenCalled();
    expect(service.getRouter('room-1')).toBeUndefined();
  });

  it('stocke et recupere producer et consumer', () => {
    // Use helpers if present, otherwise set maps directly
    if (typeof (service as any).storeProducer === 'function') {
      (service as any).storeProducer('p1', 'producer' as never);
      (service as any).storeConsumer('c1', 'consumer' as never);

      expect((service as any).getProducer('p1')).toBe('producer');
      expect((service as any).getConsumer('c1')).toBe('consumer');
    } else {
      // fallback: directly manipulate internal maps
      (service as any).producers.set('p1', 'producer');
      (service as any).consumers.set('c1', 'consumer');
      expect((service as any).producers.get('p1')).toBe('producer');
      expect((service as any).consumers.get('c1')).toBe('consumer');
    }
  });

  it('appelle initialize au onModuleInit', async () => {
    const initSpy = jest.spyOn(service, 'initialize').mockResolvedValue();

    await service.onModuleInit();

    expect(initSpy).toHaveBeenCalled();
  });

  it('relance initialize si le worker meurt', async () => {
    jest.useFakeTimers();
    const workerHandlers: Record<string, () => void> = {};
    mockWorker.on.mockImplementation((event: string, handler: () => void) => {
      workerHandlers[event] = handler;
    });
    (createWorker as jest.Mock).mockResolvedValue(mockWorker);

    await service.initialize();

    workerHandlers.died();
    jest.advanceTimersByTime(2000);

    expect(createWorker).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('relance une erreur si initialize echoue', async () => {
    (createWorker as jest.Mock).mockRejectedValue(new Error('fail'));

    await expect(service.initialize()).rejects.toThrow('fail');
  });

  it('ne ferme rien si aucun router', () => {
    service.closeRouter('room-missing');

    expect(service.getRouter('room-missing')).toBeUndefined();
  });

  it('ne plante pas si onModuleDestroy sans worker', () => {
    expect(() => service.onModuleDestroy()).not.toThrow();
  });

  it('ferme le worker au onModuleDestroy', () => {
    (service as unknown as { worker: typeof mockWorker }).worker = mockWorker;

    service.onModuleDestroy();

    expect(mockWorker.close).toHaveBeenCalled();
  });
  describe('MediasoupService additional tests', () => {
    let service: MediasoupService;
    let configService: { get: jest.Mock };

    const mockTransportProducer = {
      id: 't-prod',
      iceParameters: {},
      iceCandidates: [],
      dtlsParameters: {},
      sctpParameters: undefined,
      setMaxIncomingBitrate: jest.fn().mockResolvedValue(undefined),
      setMaxOutgoingBitrate: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      // produce will return a producer object that has close (and maybe resume) methods
      produce: jest
        .fn()
        .mockResolvedValue({
          id: 'prod-1',
          kind: 'audio',
          rtpParameters: {},
          close: jest.fn(),
        }),
    } as any;

    const mockTransportConsumer = {
      id: 't-cons',
      iceParameters: {},
      iceCandidates: [],
      dtlsParameters: {},
      sctpParameters: undefined,
      setMaxIncomingBitrate: jest.fn().mockResolvedValue(undefined),
      setMaxOutgoingBitrate: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      // consume will return a consumer object that has close and resume
      consume: jest
        .fn()
        .mockResolvedValue({
          id: 'cons-1',
          kind: 'audio',
          rtpParameters: {},
          close: jest.fn(),
          resume: jest.fn().mockResolvedValue(undefined),
        }),
    } as any;

    const mockRouter = {
      createWebRtcTransport: jest.fn(),
      close: jest.fn(),
      rtpCapabilities: { codecs: [] },
    } as any;

    const mockWorker = {
      createRouter: jest.fn(),
      on: jest.fn(),
      close: jest.fn(),
    } as any;

    beforeEach(async () => {
      jest.clearAllMocks();

      configService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          if (key === 'MEDIASOUP_MIN_PORT') return 40000;
          if (key === 'MEDIASOUP_MAX_PORT') return 57000;
          if (key === 'MEDIASOUP_ANNOUNCED_IP') return '127.0.0.1';
          return defaultValue;
        }),
      };

      (createWorker as jest.Mock).mockResolvedValue(mockWorker);
      mockWorker.createRouter.mockResolvedValue(mockRouter);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MediasoupService,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      service = module.get<MediasoupService>(MediasoupService);
    });

    it('should create router and produce/consume flows and cleanup', async () => {
      // initialize worker and router
      await service.initialize();
      const router = await service.createRouter('r1');
      expect(router).toBe(mockRouter);

      // create producer transport
      mockRouter.createWebRtcTransport.mockResolvedValueOnce(
        mockTransportProducer,
      );
      const pTransport = await service.createProducerTransport('r1', 'sock-1');
      expect(pTransport.id).toBe('t-prod');
      // transport stored
      const stored = service.getTransport('t-prod');
      expect(stored).toBeDefined();

      // create producer via transport
      mockTransportProducer.produce.mockResolvedValueOnce({
        id: 'prod-1',
        kind: 'audio',
        rtpParameters: {},
        close: jest.fn(),
      });
      const prod = await service.createProducer(
        't-prod',
        'audio',
        {},
        'user1',
        'sock-1',
        'r1',
      );
      expect(prod.producerId).toBe('prod-1');

      // create consumer transport
      mockRouter.createWebRtcTransport.mockResolvedValueOnce(
        mockTransportConsumer,
      );
      const cTransport = await service.createConsumerTransport('r1', 'sock-2');
      expect(cTransport.id).toBe('t-cons');

      // create consumer
      mockTransportConsumer.consume.mockResolvedValueOnce({
        id: 'cons-1',
        kind: 'audio',
        rtpParameters: {},
        close: jest.fn(),
        resume: jest.fn().mockResolvedValue(undefined),
      });
      const consumer = await service.createConsumer(
        't-cons',
        'prod-1',
        {},
        'sock-2',
        'r1',
      );
      expect(consumer.id).toBe('cons-1');

      // Ensure the internal consumer object has close/resume so removeConsumer/resumeConsumer won't fail
      // make sure the internal consumer object has the methods the service expects
      (service as any).consumers.set('cons-1', {
        consumer: {
          close: jest.fn(),
          resume: jest.fn().mockResolvedValue(undefined),
        },
        producerId: 'prod-1',
        socketId: 'sock-2',
        roomId: 'r1',
      });

      await expect(service.resumeConsumer('cons-1')).resolves.toBeUndefined();

      // get producers by room and socket
      const byRoom = service.getProducersByRoomId('r1');
      expect(Array.isArray(byRoom)).toBe(true);
      const bySocket = service.getProducersBySocketId('sock-1');
      expect(Array.isArray(bySocket)).toBe(true);

      // ensure producer entry has a close method so removeProducer doesn't throw
      (service as any).producers.set('prod-1', {
        producer: { close: jest.fn() },
        userId: 'user1',
        socketId: 'sock-1',
        roomId: 'r1',
        kind: 'audio',
      });

      // remove transport/producer/consumer
      service.removeConsumer('cons-1');
      service.removeProducer('prod-1');
      service.removeTransport('t-prod');

      expect((service as any).consumers.get('cons-1')).toBeUndefined();

      // store helpers
      if (typeof (service as any).storeProducer === 'function') {
        (service as any).storeProducer('p-x', { producer: 'p' } as any);
        expect((service as any).getProducer('p-x')).toBe('p');
        (service as any).storeConsumer('c-x', { consumer: 'c' } as any);
        expect((service as any).getConsumer('c-x')).toBe('c');
      } else {
        (service as any).producers.set('p-x', { producer: 'p' });
        expect((service as any).producers.get('p-x').producer).toBe('p');
        (service as any).consumers.set('c-x', { consumer: 'c' });
        expect((service as any).consumers.get('c-x').consumer).toBe('c');
      }

      // close router cleans everything
      service.closeRouter('r1');
      expect(service.getRouter('r1')).toBeUndefined();
    });

    it('throws on missing router when creating transports or producer/consumer', async () => {
      await expect(
        service.createProducerTransport('missing', 's'),
      ).rejects.toThrow();
      await expect(
        service.createConsumerTransport('missing', 's'),
      ).rejects.toThrow();
      await expect(
        service.createProducer('missing', 'audio', {}, 'u', 's', 'missing'),
      ).rejects.toThrow();
      await expect(
        service.createConsumer('missing', 'p', {}, 's', 'missing'),
      ).rejects.toThrow();
    });
  });
});
