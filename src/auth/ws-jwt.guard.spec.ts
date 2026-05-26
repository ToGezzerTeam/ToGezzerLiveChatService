import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsJwtAuthGuard } from './ws-jwt.guard';
import { WsJwtAuthService } from './ws-jwt-auth.service';

describe('WsJwtAuthGuard', () => {
  const wsJwtAuthService = {
    authenticateSocket: jest.fn(),
  } as unknown as WsJwtAuthService;

  const createContext = (client: any): ExecutionContext =>
    ({
      switchToWs: () => ({
        getClient: () => client,
      }),
    }) as ExecutionContext;

  it('should delegate authentication to WsJwtAuthService', () => {
    const client = { data: {} };

    const guard = new WsJwtAuthGuard(wsJwtAuthService);
    const result = guard.canActivate(createContext(client));

    expect(result).toBe(true);
    expect(wsJwtAuthService.authenticateSocket).toHaveBeenCalledWith(client);
  });

  it('should map UnauthorizedException to WsException', () => {
    const client = { data: {} };
    (wsJwtAuthService.authenticateSocket as jest.Mock).mockImplementation(() => {
      throw new UnauthorizedException('Missing JWT token');
    });

    const guard = new WsJwtAuthGuard(wsJwtAuthService);

    expect(() => guard.canActivate(createContext(client))).toThrow(
      new WsException('Missing JWT token'),
    );
  });

  it('should map unexpected errors to generic Unauthorized WsException', () => {
    const client = { data: {} };
    (wsJwtAuthService.authenticateSocket as jest.Mock).mockImplementation(() => {
      throw new Error('boom');
    });

    const guard = new WsJwtAuthGuard(wsJwtAuthService);

    expect(() => guard.canActivate(createContext(client))).toThrow(
      new WsException('Unauthorized'),
    );
  });
});

