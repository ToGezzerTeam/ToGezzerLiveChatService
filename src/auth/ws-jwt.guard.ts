import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WsJwtAuthService } from './ws-jwt-auth.service';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(private readonly wsJwtAuthService: WsJwtAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<Socket>();

    try {
      this.wsJwtAuthService.authenticateSocket(client);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new WsException(error.message);
      }

      throw new WsException('Unauthorized');
    }
  }
}

