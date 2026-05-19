import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWorker, types } from 'mediasoup';

interface ProducerData {
  producer: types.Producer;
  userId: string;
  socketId: string;
  roomId: string;
  kind: 'audio' | 'video';
}

interface ConsumerData {
  consumer: types.Consumer;
  producerId: string;
  socketId: string;
  roomId: string;
}

interface TransportData {
  transport: types.WebRtcTransport;
  socketId: string;
  roomId: string;
  type: 'producer' | 'consumer';
}

@Injectable()
export class MediasoupService implements OnModuleDestroy, OnModuleInit {
  private logger = new Logger('MediasoupService');
  private worker: types.Worker;
  private routers: Map<string, types.Router> = new Map();
  private producers: Map<string, ProducerData> = new Map();
  private consumers: Map<string, ConsumerData> = new Map();
  private transports: Map<string, TransportData> = new Map();

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initialize();
  }

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

      this.worker = await createWorker({
        logLevel: 'warn',
        logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
        rtcMinPort: minPort,
        rtcMaxPort: maxPort,
      });

      this.worker.on('died', () => {
        this.logger.error('MediaSoup worker died, restarting...');
        setTimeout(() => {
          void this.initialize();
        }, 2000);
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

  /**
   * Crée un transport pour producteur (envoi de médias)
   */
  async createProducerTransport(roomId: string, socketId: string) {
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
    });

    await transport.setMaxIncomingBitrate(1500000);

    // Stocker le transport
    this.storeTransport(transport.id, transport, socketId, roomId, 'producer');

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    };
  }

  /**
   * Crée un transport pour consommateur (réception de médias)
   */
  async createConsumerTransport(roomId: string, socketId: string) {
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
    });

    await transport.setMaxOutgoingBitrate(1500000);

    // Stocker le transport
    this.storeTransport(transport.id, transport, socketId, roomId, 'consumer');

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    };
  }

  /**
   * Connecte un transport DTLS
   */
  async connectTransport(
    transportId: string,
    dtlsParameters: types.DtlsParameters,
  ) {
    const transportData = this.transports.get(transportId);
    if (!transportData) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    await transportData.transport.connect({ dtlsParameters });
  }

  /**
   * Crée un producteur pour envoyer du média
   */
  async createProducer(
    transportId: string,
    kind: 'audio' | 'video',
    rtpParameters: types.RtpParameters,
    userId: string,
    socketId: string,
    roomId: string,
  ) {
    const transportData = this.transports.get(transportId);
    if (!transportData) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    const producer = await transportData.transport.produce({
      kind,
      rtpParameters,
    });

    const producerData: ProducerData = {
      producer,
      userId,
      socketId,
      roomId,
      kind,
    };

    this.producers.set(producer.id, producerData);
    this.logger.log(
      `Producer created: ${producer.id} for user ${userId} (${kind})`,
    );

    return {
      producerId: producer.id,
      kind: producer.kind,
      rtpParameters: producer.rtpParameters,
    };
  }

  /**
   * Crée un consommateur pour recevoir du média
   */
  async createConsumer(
    transportId: string,
    producerId: string,
    rtpCapabilities: types.RtpCapabilities,
    socketId: string,
    roomId: string,
  ) {
    const transportData = this.transports.get(transportId);
    if (!transportData) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    const producerData = this.producers.get(producerId);
    if (!producerData) {
      throw new Error(`Producer not found: ${producerId}`);
    }

    const router = this.getRouter(roomId);
    if (!router) {
      throw new Error(`Router not found for room: ${roomId}`);
    }

    const consumer = await transportData.transport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
    });

    const consumerData: ConsumerData = {
      consumer,
      producerId,
      socketId,
      roomId,
    };

    this.consumers.set(consumer.id, consumerData);
    this.logger.log(
      `Consumer created: ${consumer.id} for producer: ${producerId}`,
    );

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  /**
   * Reprend un consommateur (commencer à recevoir du média)
   */
  async resumeConsumer(consumerId: string) {
    const consumerData = this.consumers.get(consumerId);
    if (!consumerData) {
      throw new Error(`Consumer not found: ${consumerId}`);
    }

    await consumerData.consumer.resume();
  }

  /**
   * Récupère les producteurs d'un utilisateur
   */
  getProducersBySocketId(socketId: string): ProducerData[] {
    return Array.from(this.producers.values()).filter(
      (p) => p.socketId === socketId,
    );
  }

  /**
   * Récupère tous les producteurs d'une room
   */
  getProducersByRoomId(roomId: string): ProducerData[] {
    return Array.from(this.producers.values()).filter(
      (p) => p.roomId === roomId,
    );
  }

  /**
   * Stocke un transport pour le tracker
   */
  storeTransport(
    id: string,
    transport: types.WebRtcTransport,
    socketId: string,
    roomId: string,
    type: 'producer' | 'consumer',
  ) {
    this.transports.set(id, { transport, socketId, roomId, type });
  }

  /**
   * Récupère un transport
   */
  getTransport(id: string) {
    return this.transports.get(id);
  }

  /**
   * Supprime un transport
   */
  removeTransport(id: string) {
    const transportData = this.transports.get(id);
    if (transportData) {
      transportData.transport.close();
      this.transports.delete(id);
    }
  }

  /**
   * Supprime un producteur
   */
  removeProducer(id: string) {
    const producerData = this.producers.get(id);
    if (producerData) {
      producerData.producer.close();
      this.producers.delete(id);
    }
  }

  /**
   * Supprime un consommateur
   */
  removeConsumer(id: string) {
    const consumerData = this.consumers.get(id);
    if (consumerData) {
      consumerData.consumer.close();
      this.consumers.delete(id);
    }
  }

  /**
   * Nettoie tous les transports, producteurs et consommateurs d'un utilisateur
   */
  cleanupSocketResources(socketId: string) {
    // Supprimer les transports
    const transportsToDelete = Array.from(this.transports.keys()).filter(
      (id) => this.transports.get(id)?.socketId === socketId,
    );
    transportsToDelete.forEach((id) => this.removeTransport(id));

    // Supprimer les producteurs
    const producersToDelete = Array.from(this.producers.keys()).filter(
      (id) => this.producers.get(id)?.socketId === socketId,
    );
    producersToDelete.forEach((id) => this.removeProducer(id));

    // Supprimer les consommateurs
    const consumersToDelete = Array.from(this.consumers.keys()).filter(
      (id) => this.consumers.get(id)?.socketId === socketId,
    );
    consumersToDelete.forEach((id) => this.removeConsumer(id));
  }

  closeRouter(roomId: string) {
    // Nettoyer les ressources de la room
    const transportsToDelete = Array.from(this.transports.keys()).filter(
      (id) => this.transports.get(id)?.roomId === roomId,
    );
    transportsToDelete.forEach((id) => this.removeTransport(id));

    const producersToDelete = Array.from(this.producers.keys()).filter(
      (id) => this.producers.get(id)?.roomId === roomId,
    );
    producersToDelete.forEach((id) => this.removeProducer(id));

    const consumersToDelete = Array.from(this.consumers.keys()).filter(
      (id) => this.consumers.get(id)?.roomId === roomId,
    );
    consumersToDelete.forEach((id) => this.removeConsumer(id));

    const router = this.routers.get(roomId);
    if (router) {
      router.close();
      this.routers.delete(roomId);
      this.logger.log(`Router closed for room: ${roomId}`);
    }
  }

  onModuleDestroy() {
    if (this.worker) {
      this.worker.close();
      this.logger.log('MediaSoup worker closed');
    }
  }
}
