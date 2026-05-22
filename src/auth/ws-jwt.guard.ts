import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { verify } from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { AppConfig } from '../app.config';

type JwtPayload = Record<string, unknown> & { sub?: string };

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
    constructor(private readonly appConfig: AppConfig) {}

    canActivate(context: ExecutionContext): boolean {
        const client = context.switchToWs().getClient<Socket>();
        const token = this.extractToken(client);
        const jwtSecret = this.appConfig.getJwtSecret();

        if (!token || !jwtSecret) {
            throw new WsException('Unauthorized');
        }

        try {
            const payload = verify(token, jwtSecret, {
                issuer: this.appConfig.getJwtIssuer(),
                audience: this.appConfig.getJwtAudience(),
            }) as JwtPayload;

            client.data = client.data || {};
            client.data.user = payload;

            return true;
        } catch {
            throw new WsException('Unauthorized');
        }
    }

    private extractToken(client: Socket): string | null {
        const authToken = client.handshake?.auth?.token;
        if (typeof authToken === 'string' && authToken.length > 0) {
            return this.normalizeToken(authToken);
        }

        const headerAuth = client.handshake?.headers?.authorization ?? client.handshake?.headers?.Authorization;
        if (typeof headerAuth === 'string' && headerAuth.length > 0) {
            return this.normalizeToken(headerAuth);
        }

        return null;
    }

    private normalizeToken(value: string): string {
        const trimmed = value.trim();
        if (trimmed.toLowerCase().startsWith('bearer ')) {
            return trimmed.slice(7).trim();
        }
        return trimmed;
    }
}

