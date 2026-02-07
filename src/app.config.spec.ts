import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './app.config';

describe('AppConfig', () => {
    let appConfig: AppConfig;

    const mockConfigService = {
        getOrThrow: jest.fn(),
        get: jest.fn(),
    };

    beforeEach(async () => {
        jest.clearAllMocks();

        mockConfigService.getOrThrow.mockImplementation((key: string) => {
            switch (key) {
                case 'RABBITMQ_MESSAGE_QUEUE':
                    return 'ws_messages';
                default:
                    throw new Error(`Unknown key: ${key}`);
            }
        });

        mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
            switch (key) {
                case 'PORT':
                    return 4000;
                case 'LOG_LEVELS':
                    return "debug,log,error";
                case 'WS_CORS_ORIGIN':
                    return 'http://localhost:3000,http://example.com';
                case 'RABBITMQ_HOST':
                    return 'localhost';
                case 'RABBITMQ_PORT':
                    return 5672;
                case 'RABBITMQ_USERNAME':
                    return 'guest';
                case 'RABBITMQ_PASSWORD':
                    return 'guest';
                default:
                    return defaultValue;
            }
        });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AppConfig,
                {
                    provide: ConfigService,
                    useValue: mockConfigService,
                },
            ],
        }).compile();

        appConfig = module.get(AppConfig);
        appConfig.init();
    });

    it('should be defined', () => {
        expect(appConfig).toBeDefined();
    });

    it('should return server port', () => {
        expect(appConfig.getPort()).toBe(4000);
    });

    it('should return log levels', () => {
        expect(appConfig.getLogLevels()).toStrictEqual(['debug', 'log', 'error']);
    });

    it('should parse websocket origins', () => {
        expect(appConfig.getWebSocketCorsOrigins()).toStrictEqual([
            'http://localhost:3000',
            'http://example.com',
        ]);
    });

    it('should return RabbitMQ fields', () => {
        expect(appConfig.getRabbitmqHost()).toBe('localhost');
        expect(appConfig.getRabbitmqPort()).toBe(5672);
        expect(appConfig.getRabbitmqUsername()).toBe('guest');
        expect(appConfig.getRabbitmqPassword()).toBe('guest');
        expect(appConfig.getRabbitmqMessageQueue()).toBe('ws_messages');
    });

    it('should construct full RabbitMQ URL', () => {
        expect(appConfig.getRabbitmqUrl()).toBe(
            'amqp://guest:guest@localhost:5672',
        );
    });

    it('should handle wildcard websocket origin', () => {
        mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
            if (key === 'WS_CORS_ORIGIN') return '*';
            return defaultValue;
        });
        appConfig.init();
        expect(appConfig.getWebSocketCorsOrigins()).toBe('*');
    });
});
