import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseFilters } from '@nestjs/common';
import { MediasoupService } from '../mediasoup/mediasoup.service';
import { WsExceptionFilter } from '../exception/ws-exception.filter';
import { UserMediaState } from './ws.types';
import { WsJwtAuthService } from './ws-jwt-auth.service';

@UseFilters(WsExceptionFilter)
@WebSocketGateway({
  cors: {
    origin: process.env.WS_CORS_ORIGIN || '*',
  },
  namespace: '/voice-chat',
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
})
export class VoiceChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer() server: Server;

  private logger = new Logger('VoiceChatGateway');
  private userStates: Map<string, UserMediaState> = new Map();
  private roomUsers: Map<string, Set<string>> = new Map();
  private userConnectTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private mediasoupService: MediasoupService,
    private readonly wsJwtAuth: WsJwtAuthService,
  ) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      try {
        this.wsJwtAuth.authenticateSocket(socket);
        next();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unauthorized connection';
        this.logger.warn(`Socket ${socket.id} rejected: ${message}`);
        next(new Error(message));
      }
    });
  }

  handleConnection(@ConnectedSocket() socket: Socket) {
    this.logger.log(`Client connected: ${socket.id}`);

    // Timeout pour éviter les connexions orphelines
    const timer = setTimeout(() => {
      if (!this.userStates.has(socket.id)) {
        socket.disconnect();
        this.logger.warn(`Client ${socket.id} disconnected due to timeout`);
      }
    }, 30000);

    this.userConnectTimers.set(socket.id, timer);
  }

  handleDisconnect(@ConnectedSocket() socket: Socket) {
    const timer = this.userConnectTimers.get(socket.id);
    if (timer) {
      clearTimeout(timer);
      this.userConnectTimers.delete(socket.id);
    }

    const userState = this.userStates.get(socket.id);
    if (userState) {
      const { roomId } = userState;

      // Nettoyer les ressources WebRTC
      this.mediasoupService.cleanupSocketResources(socket.id);

      const roomUsers = this.roomUsers.get(roomId);
      if (roomUsers) {
        roomUsers.delete(socket.id);
        this.server.to(roomId).emit('userLeft', {
          socketId: socket.id,
          userId: userState.userId,
        });

        if (roomUsers.size === 0) {
          this.mediasoupService.closeRouter(roomId);
          this.roomUsers.delete(roomId);
        }
      }
      this.userStates.delete(socket.id);
    }
    this.logger.log(`Client disconnected: ${socket.id}`);
  }

  @SubscribeMessage('joinVoiceRoom')
  async handleJoinVoiceRoom(
      @ConnectedSocket() socket: Socket,
      @MessageBody() data: { roomId: string; userId: string },
  ) {
    try {
      const { roomId, userId } = data;
      this.logger.log(`[${socket.id}] User ${userId} joining room ${roomId}`);

      if (!roomId || !userId) {
        this.logger.warn(`[${socket.id}] Missing roomId or userId`);
        return { success: false, message: 'roomId and userId are required' };
      }

      // Initialiser la room si nécessaire
      if (!this.roomUsers.has(roomId)) {
        this.roomUsers.set(roomId, new Set());
        await this.mediasoupService.createRouter(roomId);
        this.logger.log(`[${socket.id}] Router created for room: ${roomId}`);
      }

      // Obtenir les utilisateurs existants AVANT d'ajouter le nouvel utilisateur
      const existingUsers = Array.from(this.roomUsers.get(roomId) || [])
          .map((id) => {
            const state = this.userStates.get(id);
            return state
                ? {
                  socketId: id,
                  userId: state.userId,
                  isMicMuted: state.isMicMuted,
                  isSongMuted: state.isSongMuted,
                }
                : null;
          })
          .filter(Boolean);

      // Créer et stocker l'état de l'utilisateur actuel
      const userState: UserMediaState = {
        socketId: socket.id,
        userId,
        roomId,
        isMicMuted: false,
        isSongMuted: false,
      };

      this.userStates.set(socket.id, userState);
      this.roomUsers.get(roomId)!.add(socket.id);

      // Joindre la room socket.io
      await socket.join(roomId);

      // Nettoyer le timer de connexion
      const timer = this.userConnectTimers.get(socket.id);
      if (timer) {
        clearTimeout(timer);
        this.userConnectTimers.delete(socket.id);
      }

      // Notifier les autres utilisateurs que quelqu'un a rejoint
      socket.to(roomId).emit('userJoined', {
        socketId: socket.id,
        userId,
        isMicMuted: userState.isMicMuted,
        isSongMuted: userState.isSongMuted,
      });

      this.logger.log(
          `[${socket.id}] User ${userId} joined room ${roomId}. Existing users: ${existingUsers.length}`,
      );

      // Retourner à l'utilisateur les utilisateurs existants + lui-même
      return {
        success: true,
        currentUser: {
          socketId: socket.id,
          userId,
          isMicMuted: userState.isMicMuted,
          isSongMuted: userState.isSongMuted,
        },
        existingUsers,
      };
    } catch (error) {
      this.logger.error(`[${socket.id}] Error joining voice room`, error);
      return { success: false, message: 'Failed to join voice room' };
    }
  }

  @SubscribeMessage('createProducerTransport')
  async handleCreateProducerTransport(
      @ConnectedSocket() socket: Socket,
      @MessageBody() data: { roomId: string },
  ) {
    try {
      const { roomId } = data;
      const userState = this.userStates.get(socket.id);

      if (!userState) {
        this.logger.warn(`[${socket.id}] User not in a voice room`);
        return { success: false, message: 'User not in a voice room' };
      }

      // Créer et stocker le transport producteur
      const transportInfo = await this.mediasoupService.createProducerTransport(
          roomId,
          socket.id,
      );

      userState.producerTransportId = transportInfo.id;

      this.logger.log(
          `[${socket.id}] Producer transport created for user ${userState.userId}: ${transportInfo.id}`,
      );

      return {
        success: true,
        transport: transportInfo,
      };
    } catch (error) {
      this.logger.error(
          `[${socket.id}] Error creating producer transport`,
          error,
      );
      return { success: false, message: 'Failed to create producer transport' };
    }
  }

  /**
   * Crée un transport consommateur pour l'utilisateur
   */
  @SubscribeMessage('createConsumerTransport')
  async handleCreateConsumerTransport(
      @ConnectedSocket() socket: Socket,
      @MessageBody() data: { roomId: string },
  ) {
    try {
      const { roomId } = data;
      const userState = this.userStates.get(socket.id);

      if (!userState) {
        this.logger.warn(`[${socket.id}] User not in a voice room`);
        return { success: false, message: 'User not in a voice room' };
      }

      // Créer et stocker le transport consommateur
      const transportInfo = await this.mediasoupService.createConsumerTransport(
          roomId,
          socket.id,
      );

      userState.consumerTransportId = transportInfo.id;

      this.logger.log(
          `[${socket.id}] Consumer transport created for user ${userState.userId}: ${transportInfo.id}`,
      );

      return {
        success: true,
        transport: transportInfo,
      };
    } catch (error) {
      this.logger.error(
          `[${socket.id}] Error creating consumer transport`,
          error,
      );
      return { success: false, message: 'Failed to create consumer transport' };
    }
  }

  /**
   * Connecte le transport producteur au serveur
   */
  @SubscribeMessage('connectProducerTransport')
  async handleConnectProducerTransport(
      @ConnectedSocket() socket: Socket,
      @MessageBody()
      data: { dtlsParameters: any },
  ) {
    try {
      const userState = this.userStates.get(socket.id);
      if (!userState?.producerTransportId) {
        return { success: false, message: 'Producer transport not found' };
      }

      await this.mediasoupService.connectTransport(
          userState.producerTransportId,
          data.dtlsParameters,
      );

      this.logger.log(
          `Producer transport connected for user ${userState.userId}`,
      );

      return { success: true };
    } catch (error) {
      this.logger.error('Error connecting producer transport', error);
      return {
        success: false,
        message: 'Failed to connect producer transport',
      };
    }
  }

  /**
   * Connecte le transport consommateur au serveur
   */
  @SubscribeMessage('connectConsumerTransport')
  async handleConnectConsumerTransport(
      @ConnectedSocket() socket: Socket,
      @MessageBody()
      data: { dtlsParameters: any },
  ) {
    try {
      const userState = this.userStates.get(socket.id);
      if (!userState?.consumerTransportId) {
        return { success: false, message: 'Consumer transport not found' };
      }

      await this.mediasoupService.connectTransport(
          userState.consumerTransportId,
          data.dtlsParameters,
      );

      this.logger.log(
          `Consumer transport connected for user ${userState.userId}`,
      );

      return { success: true };
    } catch (error) {
      this.logger.error('Error connecting consumer transport', error);
      return {
        success: false,
        message: 'Failed to connect consumer transport',
      };
    }
  }

  /**
   * Crée un producteur pour envoyer du média (audio/vidéo)
   */
  @SubscribeMessage('produce')
  async handleProduce(
      @ConnectedSocket() socket: Socket,
      @MessageBody()
      data: {
        kind: 'audio' | 'video';
        rtpParameters: any;
      },
  ) {
    try {
      const userState = this.userStates.get(socket.id);
      if (!userState?.producerTransportId) {
        return { success: false, message: 'Producer transport not found' };
      }

      const producer = await this.mediasoupService.createProducer(
          userState.producerTransportId,
          data.kind,
          data.rtpParameters,
          userState.userId,
          socket.id,
          userState.roomId,
      );

      if (!userState.producers) {
        userState.producers = new Map();
      }
      userState.producers.set(data.kind, producer.producerId);

      // Notifier les autres utilisateurs du nouveau producteur
      socket.to(userState.roomId).emit('producerAdded', {
        socketId: socket.id,
        userId: userState.userId,
        producerId: producer.producerId,
        kind: data.kind,
      });

      this.logger.log(
          `Producer created: ${producer.producerId} for user ${userState.userId} (${data.kind})`,
      );

      return {
        success: true,
        producer,
      };
    } catch (error) {
      this.logger.error('Error producing media', error);
      return { success: false, message: 'Failed to produce media' };
    }
  }

  /**
   * Crée un consommateur pour recevoir du média d'un autre utilisateur
   */
  @SubscribeMessage('consume')
  async handleConsume(
      @ConnectedSocket() socket: Socket,
      @MessageBody()
      data: {
        producerId: string;
        rtpCapabilities: any;
      },
  ) {
    try {
      const userState = this.userStates.get(socket.id);
      if (!userState?.consumerTransportId) {
        return { success: false, message: 'Consumer transport not found' };
      }

      const consumer = await this.mediasoupService.createConsumer(
          userState.consumerTransportId,
          data.producerId,
          data.rtpCapabilities,
          socket.id,
          userState.roomId,
      );

      if (!userState.consumers) {
        userState.consumers = new Map();
      }
      userState.consumers.set(data.producerId, consumer.id);

      this.logger.log(
          `Consumer created: ${consumer.id} for producer: ${data.producerId}`,
      );

      return {
        success: true,
        consumer,
      };
    } catch (error) {
      this.logger.error('Error consuming media', error);
      return { success: false, message: 'Failed to consume media' };
    }
  }

  @SubscribeMessage('getProducers')
  handleGetProducers(@ConnectedSocket() socket: Socket) {
    const userState = this.userStates.get(socket.id);
    if (!userState) return;

    const producers = this.mediasoupService
        .getProducersByRoomId(userState.roomId)
        .map((p) => ({
          producerId: p.producer.id,
          socketId: p.socketId,
        }));

    return producers;
  }

  /**
   * Reprend un consommateur (commence à recevoir du média)
   */
  @SubscribeMessage('consumerResume')
  async handleConsumerResume(
      @ConnectedSocket() socket: Socket,
      @MessageBody()
      data: {
        consumerId: string;
      },
  ) {
    try {
      await this.mediasoupService.resumeConsumer(data.consumerId);

      this.logger.log(`Consumer resumed: ${data.consumerId}`);

      return { success: true };
    } catch (error) {
      this.logger.error('Error resuming consumer', error);
      return { success: false, message: 'Failed to resume consumer' };
    }
  }

  /**
   * Retourne les RTP capabilities du serveur
   */
  @SubscribeMessage('getRtpCapabilities')
  handleGetRtpCapabilities(
      @ConnectedSocket() socket: Socket,
      @MessageBody() data: { roomId: string },
  ) {
    try {
      const { roomId } = data;
      this.logger.log(
          `[${socket.id}] RTP capabilities requested for room: ${roomId}`,
      );

      const router = this.mediasoupService.getRouter(roomId);
      if (!router) {
        this.logger.warn(`[${socket.id}] Router not found for room: ${roomId}`);
        return {
          success: false,
          message: 'Router not found',
        };
      }

      const rtpCapabilities = router.rtpCapabilities;
      this.logger.log(
          `[${socket.id}] RTP capabilities returned: ${JSON.stringify(rtpCapabilities).substring(0, 100)}...`,
      );

      return {
        success: true,
        rtpCapabilities,
      };
    } catch (error) {
      this.logger.error(`[${socket.id}] Error getting RTP capabilities`, error);
      return { success: false, message: 'Failed to get RTP capabilities' };
    }
  }

  @SubscribeMessage('toggleMic')
  handleToggleMic(
      @ConnectedSocket() socket: Socket,
      @MessageBody() data: { isMuted: boolean },
  ) {
    const userState = this.userStates.get(socket.id);
    if (userState) {
      userState.isMicMuted = data.isMuted;

      this.server.to(userState.roomId).emit('userMediaStateChanged', {
        socketId: socket.id,
        userId: userState.userId,
        isMicMuted: userState.isMicMuted,
        isSongMuted: userState.isSongMuted,
      });

      this.logger.log(
          `User ${userState.userId} ${data.isMuted ? 'muted' : 'unmuted'} mic`,
      );
    }
  }

  @SubscribeMessage('toggleSong')
  handleToggleSong(
      @ConnectedSocket() socket: Socket,
      @MessageBody() data: { isMuted: boolean },
  ) {
    const userState = this.userStates.get(socket.id);
    if (userState) {
      userState.isSongMuted = data.isMuted;

      this.server.to(userState.roomId).emit('userMediaStateChanged', {
        socketId: socket.id,
        userId: userState.userId,
        isMicMuted: userState.isMicMuted,
        isSongMuted: userState.isSongMuted,
      });

      this.logger.log(
          `User ${userState.userId} ${data.isMuted ? 'disabled' : 'enabled'} song`,
      );
    }
  }

  @SubscribeMessage('leaveVoiceRoom')
  async handleLeaveVoiceRoom(@ConnectedSocket() socket: Socket) {
    const userState = this.userStates.get(socket.id);
    if (userState) {
      const { roomId } = userState;
      await socket.leave(roomId);

      // Nettoyer les ressources WebRTC
      this.mediasoupService.cleanupSocketResources(socket.id);

      const roomUsers = this.roomUsers.get(roomId);
      if (roomUsers) {
        roomUsers.delete(socket.id);
        if (roomUsers.size === 0) {
          this.mediasoupService.closeRouter(roomId);
          this.roomUsers.delete(roomId);
        }
      }

      this.server.to(roomId).emit('userLeft', {
        socketId: socket.id,
        userId: userState.userId,
      });

      this.userStates.delete(socket.id);
      this.logger.log(`User ${userState.userId} left room ${roomId}`);
    }
  }
}
