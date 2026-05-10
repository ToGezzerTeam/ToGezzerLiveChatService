// src/common/ws-exception.filter.ts
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';

@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const client = host.switchToWs().getClient();
    const data = host.switchToWs().getData();

    client.emit('error', {
      message: exception.message || 'An error occurred',
    });

    super.catch(exception, host);
  }
}
