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
    service.storeProducer('p1', 'producer' as never);
    service.storeConsumer('c1', 'consumer' as never);

    expect(service.getProducer('p1')).toBe('producer');
    expect(service.getConsumer('c1')).toBe('consumer');
  });
});
