import { ExecutionContext } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import { WsJwtAuthGuard } from './ws-jwt.guard';
import { AppConfig } from '../app.config';

describe('WsJwtAuthGuard', () => {
    const appConfig = {
        getJwtSecret: () => 'test-secret',
        getJwtIssuer: () => undefined,
        getJwtAudience: () => undefined,
    } as AppConfig;

    const createContext = (client: any): ExecutionContext =>
        ({
            switchToWs: () => ({
                getClient: () => client,
            }),
        }) as ExecutionContext;

    it('should allow a valid token in auth payload', () => {
        const token = sign({ sub: 'user-123' }, 'test-secret');
        const client = { handshake: { auth: { token } }, data: {} };

        const guard = new WsJwtAuthGuard(appConfig);
        const result = guard.canActivate(createContext(client));

        expect(result).toBe(true);
        expect(client.data.user.sub).toBe('user-123');
    });

    it('should reject when token is missing', () => {
        const client = { handshake: { auth: {} } };

        const guard = new WsJwtAuthGuard(appConfig);

        expect(() => guard.canActivate(createContext(client))).toThrow('Unauthorized');
    });

    it('should allow bearer token from Authorization header', () => {
        const token = sign({ sub: 'user-456' }, 'test-secret');
        const client = {
            handshake: {
                headers: { authorization: `Bearer ${token}` },
            },
            data: {},
        };

        const guard = new WsJwtAuthGuard(appConfig);
        const result = guard.canActivate(createContext(client));

        expect(result).toBe(true);
        expect(client.data.user.sub).toBe('user-456');
    });

    it('should reject invalid token', () => {
        const token = sign({ sub: 'user-789' }, 'other-secret');
        const client = { handshake: { auth: { token } } };

        const guard = new WsJwtAuthGuard(appConfig);

        expect(() => guard.canActivate(createContext(client))).toThrow('Unauthorized');
    });

    it('should validate issuer and audience when configured', () => {
        const configWithIssuerAudience = {
            getJwtSecret: () => 'test-secret',
            getJwtIssuer: () => 'issuer-1',
            getJwtAudience: () => 'aud-1',
        } as AppConfig;

        const token = sign({ sub: 'user-999' }, 'test-secret', {
            issuer: 'issuer-1',
            audience: 'aud-1',
        });
        const client = { handshake: { auth: { token } }, data: {} };

        const guard = new WsJwtAuthGuard(configWithIssuerAudience);
        const result = guard.canActivate(createContext(client));

        expect(result).toBe(true);
        expect(client.data.user.sub).toBe('user-999');
    });
});

