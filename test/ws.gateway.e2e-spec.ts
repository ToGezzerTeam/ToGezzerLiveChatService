import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { WsGateway } from '../src/ws/ws.gateway';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { WsJwtAuthService } from '../src/auth/ws-jwt-auth.service';
import { WsJwtAuthGuard } from '../src/auth/ws-jwt.guard';

const TEST_PORT = 3001;

describe('WsGateway (e2e)', () => {
  let app: INestApplication;
  let gateway: WsGateway;
  let jwtToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    const jwtService = new JwtService({ secret: process.env.JWT_SECRET });
    jwtToken = jwtService.sign({
      sub: 'user-e2e-1',
      id: 1,
      uuid: 'uuid-e2e-1',
      email: 'user.e2e@example.com',
      username: 'user-e2e-1',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: process.env.JWT_SECRET })],
      providers: [WsGateway, WsJwtAuthGuard, WsJwtAuthService],
    }).compile();

    app = moduleFixture.createNestApplication();
    gateway = moduleFixture.get<WsGateway>(WsGateway);
    await app.listen(TEST_PORT);
  });

  afterAll(async () => {
    await app.close();
  });

  const assertForwardedMessage = async (
    clientSocket: ClientSocket,
    message: {
      roomId: string;
      authorId: string;
      state: string;
      content: { type: string; value: string };
    },
  ) => {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for websocket message event'));
      }, 3000);

      clientSocket.on('connect', () => {
        clientSocket.emit('joinRoom', message.roomId);

        setTimeout(() => {
          gateway.forwardRabbitMessage(message as any); // ← appel direct
        }, 50);
      });

      clientSocket.on('message', (data: unknown) => {
        clearTimeout(timeout);
        expect(data).toEqual(message);
        resolve();
      });

      clientSocket.on('connect_error', (err: unknown) => {
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  };

  it('client should join room and receive forwarded RabbitMQ message with websocket auth payload', async () => {
    const clientSocket = io(`http://localhost:${TEST_PORT}`, {
      auth: { token: jwtToken },
    });
    const message = {
      roomId: 'room-e2e-1',
      authorId: 'author-e2e-1',
      state: 'created',
      content: { type: 'text', value: 'Hello' },
    };

    try {
      await assertForwardedMessage(clientSocket, message);
    } finally {
      clientSocket.disconnect();
    }
  });

  it('client should join room and receive forwarded RabbitMQ message with Authorization header', async () => {
    const clientSocket = io(`http://localhost:${TEST_PORT}`, {
      extraHeaders: { authorization: `Bearer ${jwtToken}` },
    });
    const message = {
      roomId: 'room-e2e-2',
      authorId: 'author-e2e-2',
      state: 'created',
      content: { type: 'text', value: 'Hello again' },
    };

    try {
      await assertForwardedMessage(clientSocket, message);
    } finally {
      clientSocket.disconnect();
    }
  });
});
