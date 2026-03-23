import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { RabbitmqService } from '../src/rabbitmq/rabbitmq.service';
import { WsGateway } from '../src/ws/ws.gateway';

const TEST_PORT = 3001;

describe('WsGateway (e2e)', () => {
  let app: INestApplication;
  let clientSocket: ClientSocket;
  const mockRabbitmqService = { sendMessage: jest.fn() };

  beforeAll(async () => {
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

  it('client should connect and receive response', async () => {
    clientSocket = io(`http://localhost:${TEST_PORT}`);
    const message = {
      roomId: 'room-e2e-1',
      authorId: 'author-e2e-1',
      state: 'created',
      content: { type: 'text', value: 'Hello' },
    };

    await new Promise<void>((resolve, reject) => {
      clientSocket.on('connect', () => {
        clientSocket.emit('message', message);
      });

      clientSocket.on('response', (data: unknown) => {
        const response = data as { status?: string };
        expect(response.status).toBe('queued');
        resolve();
      });

      clientSocket.on('connect_error', reject);
    });

    expect(mockRabbitmqService.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockRabbitmqService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        ...message,
        createdAt: expect.any(Number),
      }),
    );
  });
});
