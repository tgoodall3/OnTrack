import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
  roles?: string[];
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run(context: Omit<RequestContext, 'requestId'> & { requestId?: string }, callback: () => void) {
    const payload: RequestContext = {
      requestId: context.requestId ?? randomUUID(),
      tenantId: context.tenantId,
      userId: context.userId,
      roles: context.roles,
    };
    this.storage.run(payload, callback);
  }

  get context(): RequestContext {
    return this.storage.getStore() ?? { requestId: randomUUID() };
  }

  setTenantId(tenantId: string | undefined) {
    const store = this.storage.getStore();
    if (store) {
      store.tenantId = tenantId;
    }
  }

  setUser(userId: string | undefined, roles?: string[]) {
    const store = this.storage.getStore();
    if (store) {
      store.userId = userId;
      store.roles = roles;
    }
  }
}
