import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

type WsJwtPayload = Record<string, unknown> & {
  sub?: string; // the unique identifier used to sign the token, should be the uuid
  id: number;
  uuid: string;
  email: string;
  username: string;
};

@Injectable()
export class WsJwtAuthService {
  constructor(private readonly jwtService: JwtService) {}

  authenticateSocket(socket: Socket): WsJwtPayload {
    const token = this.extractWsJwtToken(socket);
    if (!token) {
      throw new UnauthorizedException('Missing JWT token');
    }

    try {
      const payload = this.jwtService.verify<WsJwtPayload>(token);
      const socketData = socket.data as { user?: WsJwtPayload };
      socketData.user = payload;
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid JWT token');
    }
  }

  extractWsJwtToken(socket: Pick<Socket, 'handshake'>): string | null {
    const authToken = socket.handshake?.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return this.normalizeWsJwtToken(authToken);
    }

    const headers = socket.handshake?.headers as
        | Record<string, string | string[] | undefined>
        | undefined;
    const authorizationHeader = headers?.authorization ?? headers?.Authorization;

    if (typeof authorizationHeader === 'string' && authorizationHeader.trim()) {
      return this.normalizeWsJwtToken(authorizationHeader);
    }

    if (Array.isArray(authorizationHeader) && authorizationHeader.length > 0) {
      const firstHeader = authorizationHeader[0];
      if (firstHeader.trim()) {
        return this.normalizeWsJwtToken(firstHeader);
      }
    }

    return null;
  }

  normalizeWsJwtToken(value: string): string {
    const trimmed = value.trim();
    if (trimmed.toLowerCase().startsWith('bearer ')) {
      return trimmed.slice(7).trim();
    }

    return trimmed;
  }
}
