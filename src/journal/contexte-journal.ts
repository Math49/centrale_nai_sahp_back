import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

interface PorteeRequete {
  traces: number;
}

@Injectable()
export class ContexteJournal {
  private readonly portee = new AsyncLocalStorage<PorteeRequete>();

  executer<T>(action: () => T): T {
    return this.portee.run({ traces: 0 }, action);
  }

  signalerTrace(): void {
    const portee = this.portee.getStore();

    if (portee) {
      portee.traces += 1;
    }
  }

  dejaTrace(): boolean {
    return (this.portee.getStore()?.traces ?? 0) > 0;
  }
}
