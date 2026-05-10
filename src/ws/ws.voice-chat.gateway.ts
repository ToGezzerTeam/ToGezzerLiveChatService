// src/websocket/voice-chat.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseFilters } from '@nestjs/common';
import { MediasoupService } from '../mediasoup/mediasoup.service';
import { WsExceptionFilter } from '../exception/ws-exception.filter';
import { UserMediaState } from './ws.types';

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
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  private logger = new Logger('VoiceChatGateway');
  private userStates: Map<string, UserMediaState> = new Map();
  private roomUsers: Map<string, Set<string>> = new Map();
  private userConnectTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private mediasoupService: MediasoupService) {}

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

      if (!roomId || !userId) {
        socket.emit('error', { message: 'roomId and userId are required' });
        return;
      }

      await socket.join(roomId);

      const userState: UserMediaState = {
        socketId: socket.id,
        userId,
        roomId,
        isMicMuted: false,
        isSongMuted: false,
      };

      this.userStates.set(socket.id, userState);

      if (!this.roomUsers.has(roomId)) {
        this.roomUsers.set(roomId, new Set());
        await this.mediasoupService.createRouter(roomId);
      }

      this.roomUsers.get(roomId)!.add(socket.id);

      // Nettoyer le timer de connexion
      const timer = this.userConnectTimers.get(socket.id);
      if (timer) {
        clearTimeout(timer);
        this.userConnectTimers.delete(socket.id);
      }

      socket.to(roomId).emit('userJoined', {
        socketId: socket.id,
        userId,
        isMicMuted: userState.isMicMuted,
        isSongMuted: userState.isSongMuted,
      });

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

      socket.emit('joinedVoiceRoom', { success: true, existingUsers });
      this.logger.log(`User ${userId} joined room ${roomId}`);
    } catch (error) {
      this.logger.error('Error joining voice room', error);
      socket.emit('error', { message: 'Failed to join voice room' });
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
  handleToggleCamera(
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
