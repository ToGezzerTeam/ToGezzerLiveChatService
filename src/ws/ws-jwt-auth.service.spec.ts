import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { WsJwtAuthService } from './ws-jwt-auth.service';
import { AppConfig } from '../app.config';

const createSocket = (
  handshakeOverrides: Partial<Socket['handshake']> = {},
): Socket =>
  ({
    id: 'sock-1',
    data: {},
    handshake: {
      auth: {},
      headers: {},
      query: {},
      ...handshakeOverrides,
    },
  }) as Socket;

describe('WsJwtAuthService', () => {
  let service: WsJwtAuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret';

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        JwtModule.register({ secret: process.env.JWT_SECRET }),
      ],
      providers: [AppConfig, WsJwtAuthService],
    }).compile();

    service = module.get(WsJwtAuthService);
    jwtService = module.get(JwtService);
  });

  it('authenticates with token from Authorization header', () => {
    const token = jwtService.sign({
      sub: 'uuid-1',
      id: 1,
      uuid: 'uuid-1',
      email: 'user.1@example.com',
      username: 'user1',
    });
    const socket = createSocket({
      headers: { authorization: `Bearer ${token}` },
    });

    const payload = service.authenticateSocket(socket);

    expect(payload.sub).toBe('uuid-1');
    expect(payload.id).toBe(1);
    expect(payload.uuid).toBe('uuid-1');
    expect(payload.email).toBe('user.1@example.com');
    expect(payload.username).toBe('user1');
  });

  it('rejects when token is missing', () => {
    const socket = createSocket();

    expect(() => service.authenticateSocket(socket)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when token is invalid', () => {
    const socket = createSocket({ auth: { token: 'invalid' } });

    expect(() => service.authenticateSocket(socket)).toThrow(
      UnauthorizedException,
    );
  });
});
