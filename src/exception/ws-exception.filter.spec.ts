import { ArgumentsHost } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { WsExceptionFilter } from './ws-exception.filter';

describe('WsExceptionFilter', () => {
  const createHost = () => {
    const emit = jest.fn();
    const host = {
      switchToWs: () => ({
        getClient: () => ({ emit }),
        getData: () => ({ test: true }),
      }),
    } as unknown as ArgumentsHost;

    return { host, emit };
  };

  it('emits error with exception message', () => {
    const filter = new WsExceptionFilter();
    const { host, emit } = createHost();
    const baseCatch = jest
      .spyOn(BaseWsExceptionFilter.prototype, 'catch')
      .mockImplementation(() => undefined);

    filter.catch(new Error('boom'), host);

    expect(emit).toHaveBeenCalledWith('error', { message: 'boom' });
    expect(baseCatch).toHaveBeenCalled();
    baseCatch.mockRestore();
  });

  it('emits error with default message when missing', () => {
    const filter = new WsExceptionFilter();
    const { host, emit } = createHost();
    const baseCatch = jest
      .spyOn(BaseWsExceptionFilter.prototype, 'catch')
      .mockImplementation(() => undefined);

    filter.catch({} as Error, host);

    expect(emit).toHaveBeenCalledWith('error', {
      message: 'An error occurred',
    });
    expect(baseCatch).toHaveBeenCalled();
    baseCatch.mockRestore();
  });
});
