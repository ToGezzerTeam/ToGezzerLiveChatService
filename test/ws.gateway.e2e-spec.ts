import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket as ClientSocket } from 'socket.io-client';
import {RabbitmqService} from "../src/rabbitmq/rabbitmq.service";
import {WsGateway} from "../src/ws/ws.gateway";

const TEST_PORT = 3001;

describe('WsGateway (e2e)', () => {
    let app: INestApplication;
    let clientSocket: ClientSocket;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            providers: [
                WsGateway,
                {
                    provide: RabbitmqService,
                    useValue: { sendMessage: jest.fn() },
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

        await new Promise<void>((resolve, reject) => {
            clientSocket.on('connect', () => {
                clientSocket.emit('message', { text: 'Hello' });
            });

            clientSocket.on('response', (data) => {
                expect(data.status).toBe('queued');
                resolve();
            });

            clientSocket.on('connect_error', reject);
        });
    });
});
