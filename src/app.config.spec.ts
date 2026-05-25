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
        case 'JWT_SECRET':
          return 'test-secret';
        case 'RABBITMQ_MESSAGE_QUEUE':
          return 'ws_messages';
        default:
          throw new Error(`Unknown key: ${key}`);
      }
    });

    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        switch (key) {
          case 'PORT':
            return 4000;
          case 'LOG_LEVELS':
            return 'debug,log,error';
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
          case 'RABBITMQ_EXCHANGE':
            return 'message.exchange';
          case 'RABBITMQ_ROUTING_KEY':
            return 'routing-message-live-chat-service';
          case 'RABBITMQ_EXCHANGE_TYPE':
            return 'topic';
          case 'JWT_ISSUER':
            return 'issuer-1';
          case 'JWT_AUDIENCE':
            return 'aud-1';
          default:
            return defaultValue as string | number | undefined;
        }
      },
    );

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
    expect(appConfig.getRabbitmqExchange()).toBe('message.exchange');
    expect(appConfig.getRabbitmqRoutingKey()).toBe(
      'routing-message-live-chat-service',
    );
    expect(appConfig.getRabbitmqExchangeType()).toBe('topic');
  });

  it('should return JWT fields', () => {
    expect(appConfig.getJwtSecret()).toBe('test-secret');
    expect(appConfig.getJwtIssuer()).toBe('issuer-1');
    expect(appConfig.getJwtAudience()).toBe('aud-1');
  });

  it('should construct full RabbitMQ URL', () => {
    expect(appConfig.getRabbitmqUrl()).toBe(
      'amqp://guest:guest@localhost:5672',
    );
  });

  it('should handle wildcard websocket origin', () => {
    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'WS_CORS_ORIGIN') return '*';
        return defaultValue as string | number | undefined;
      },
    );
    appConfig.init();
    expect(appConfig.getWebSocketCorsOrigins()).toBe('*');
  });

  it('should return default port when not configured', async () => {
    const newMockConfigService = {
      getOrThrow: jest.fn(() => 'ws_messages'),
      get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
    };

    const mockModule = Test.createTestingModule({
      providers: [
        AppConfig,
        { provide: ConfigService, useValue: newMockConfigService },
      ],
    });

    await mockModule.compile().then((module) => {
      const config = module.get(AppConfig);
      config.init();
      expect(config.getPort()).toBe(3000);
    });
  });

  it('should filter out invalid log levels', () => {
    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'LOG_LEVELS') return 'debug,invalid-level,log,error';
        return defaultValue as string | number | undefined;
      },
    );
    appConfig.init();
    expect(appConfig.getLogLevels()).toEqual(['debug', 'log', 'error']);
  });

  it('should parse single origin without comma', () => {
    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'WS_CORS_ORIGIN') return 'http://localhost:3000';
        return defaultValue as string | number | undefined;
      },
    );
    appConfig.init();
    expect(appConfig.getWebSocketCorsOrigins()).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('should handle empty string origin as fallback', () => {
    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'WS_CORS_ORIGIN') return '';
        return defaultValue as string | number | undefined;
      },
    );
    appConfig.init();
    expect(appConfig.getWebSocketCorsOrigins()).toBe('*');
  });

  it('should parse multiple log levels correctly', () => {
    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'LOG_LEVELS') return 'verbose,debug,log,warn,error,fatal';
        return defaultValue as string | number | undefined;
      },
    );
    appConfig.init();
    expect(appConfig.getLogLevels()).toEqual([
      'verbose',
      'debug',
      'log',
      'warn',
      'error',
      'fatal',
    ]);
  });

  it('should parse origins with spaces', () => {
    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'WS_CORS_ORIGIN')
          return '  http://localhost:3000  ,  http://example.com  ';
        return defaultValue as string | number | undefined;
      },
    );
    appConfig.init();
    expect(appConfig.getWebSocketCorsOrigins()).toEqual([
      'http://localhost:3000',
      'http://example.com',
    ]);
  });

  it('should default to wildcard when WS_CORS_ORIGIN is null', () => {
    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'WS_CORS_ORIGIN') return null;
        return defaultValue as string | number | undefined;
      },
    );
    appConfig.init();
    expect(appConfig.getWebSocketCorsOrigins()).toBe('*');
  });
});
