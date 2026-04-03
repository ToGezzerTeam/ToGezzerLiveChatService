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
        const response = data as { status?: string; uuid?: string };
        expect(response.status).toBe('queued');
        expect(typeof response.uuid).toBe('string');
        expect(response.uuid).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
        resolve();
      });

      clientSocket.on('connect_error', (err: unknown) =>
        reject(err instanceof Error ? err : new Error(String(err))),
      );
    });

    expect(mockRabbitmqService.sendMessage).toHaveBeenCalledTimes(1);

    const firstCallArgs = mockRabbitmqService.sendMessage.mock.calls[0] as [
      { uuid?: string },
    ];
    const sentUuid = firstCallArgs?.[0]?.uuid;

    expect(mockRabbitmqService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'LiveChatService',
        payload: message,
        timestamp: expect.any(Number) as unknown,
        createdAt: expect.any(Number) as unknown,
        uuid: sentUuid,
      }),
    );
  });
});
