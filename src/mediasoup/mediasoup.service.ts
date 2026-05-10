// src/mediasoup/mediasoup.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mediasoup from 'mediasoup';
import { Worker, Router, Producer, Consumer } from 'mediasoup/node/lib/types'

@Injectable()
export class MediasoupService implements OnModuleDestroy {
  private logger = new Logger('MediasoupService');
  private worker: Worker;
  private routers: Map<string, Router> = new Map();
  private producers: Map<string, Producer> = new Map();
  private consumers: Map<string, Consumer> = new Map();

  constructor(private configService: ConfigService) {}

  async initialize() {
    try {
      const minPort = this.configService.get<number>(
        'MEDIASOUP_MIN_PORT',
        40000,
      );
      const maxPort = this.configService.get<number>(
        'MEDIASOUP_MAX_PORT',
        57000,
      );

      this.worker = await mediasoup.createWorker({
        logLevel: 'warn',
        logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
        rtcMinPort: minPort,
        rtcMaxPort: maxPort,
      });

      this.worker.on('died', () => {
        this.logger.error('MediaSoup worker died, restarting...');
        setTimeout(() => this.initialize(), 2000);
      });

      this.logger.log('MediaSoup worker initialized');
    } catch (error) {
      this.logger.error('Failed to initialize MediaSoup', error);
      throw error;
    }
  }

  async createRouter(roomId: string) {
    if (this.routers.has(roomId)) {
      return this.routers.get(roomId);
    }

    const router = await this.worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
          parameters: {
            useinbandfec: 1,
            maxaveragebitrate: 96000,
            maxplaybackrate: 48000,
            ptime: 10,
            stereo: 1,
          },
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {
            'x-google-start-bitrate': 1000,
          },
        },
      ],
    });

    this.routers.set(roomId, router);
    this.logger.log(`Router created for room: ${roomId}`);
    return router;
  }

  getRouter(roomId: string) {
    return this.routers.get(roomId);
  }

  async createProducerTransport(roomId: string) {
    const router = this.getRouter(roomId);
    if (!router) {
      throw new Error(`Router not found for room: ${roomId}`);
    }

    const transport = await router.createWebRtcTransport({
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: this.configService.get<string>(
            'MEDIASOUP_ANNOUNCED_IP',
            '127.0.0.1',
          ),
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
      maxIncomingBitrate: 1500000,
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    };
  }

  async closeRouter(roomId: string) {
    const router = this.routers.get(roomId);
    if (router) {
      router.close();
      this.routers.delete(roomId);
      this.logger.log(`Router closed for room: ${roomId}`);
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      this.worker.close();
      this.logger.log('MediaSoup worker closed');
    }
  }

  storeProducer(id: string, producer: Producer) {
    this.producers.set(id, producer);
  }

  getProducer(id: string) {
    return this.producers.get(id);
  }

  storeConsumer(id: string, consumer: Consumer) {
    this.consumers.set(id, consumer);
  }

  getConsumer(id: string) {
    return this.consumers.get(id);
  }
}
