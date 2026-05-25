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
    const token = this.extractToken(socket);
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

  private extractToken(socket: Socket): string | null {
    const authorization = this.getAuthorizationHeader(socket);
    if (authorization) {
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      return match ? match[1] : authorization;
    }

    return null;
  }

  private getAuthorizationHeader(socket: Socket): string | null {
    const headers = socket.handshake.headers as
      | Record<string, string | string[] | undefined>
      | undefined;
    const authorizationHeader = headers?.authorization;
    if (typeof authorizationHeader === 'string' && authorizationHeader.trim()) {
      return authorizationHeader;
    }
    if (Array.isArray(authorizationHeader) && authorizationHeader.length > 0) {
      return authorizationHeader[0];
    }
    return null;
  }
}
