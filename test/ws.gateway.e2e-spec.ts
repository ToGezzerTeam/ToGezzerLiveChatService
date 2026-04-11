import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { RabbitmqService } from '../src/rabbitmq/rabbitmq.service';
import { WsGateway } from '../src/ws/ws.gateway';

const TEST_PORT = 3001;

describe('WsGateway (e2e)', () => {
  let app: INestApplication;
  let clientSocket: ClientSocket;
  let rabbitMessageHandler:
    | ((message: unknown) => Promise<void> | void)
    | null = null;
  const mockRabbitmqService = {
    registerMessageHandler: jest.fn(
      (handler: (message: unknown) => Promise<void> | void) => {
        rabbitMessageHandler = handler;
      },
    ),
  };

  beforeAll(async () => {
    rabbitMessageHandler = null;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        WsGateway,
        {
          provide: RabbitmqService,
          useValue: mockRabbitmqService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(TEST_PORT);
  });

  afterAll(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    await app.close();
  });

  it('client should join room and receive forwarded RabbitMQ message', async () => {
    clientSocket = io(`http://localhost:${TEST_PORT}`);
    const message = {
      roomId: 'room-e2e-1',
      authorId: 'author-e2e-1',
      state: 'created',
      content: { type: 'text', value: 'Hello' },
    };

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for websocket message event'));
      }, 3000);

      clientSocket.on('connect', () => {
        clientSocket.emit('joinRoom', message.roomId);

        // Let the join be processed before simulating RabbitMQ delivery.
        setTimeout(() => {
          void rabbitMessageHandler?.(message);
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

    expect(mockRabbitmqService.registerMessageHandler).toHaveBeenCalledTimes(1);
  });
});
