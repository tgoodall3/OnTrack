import { PrismaService } from './prisma.service';

type DelegateMethodArgs<TDelegate, TMethod extends keyof TDelegate> = TDelegate[TMethod] extends (
  ...args: infer A
) => any
  ? A
  : never;

type DelegateMethodReturn<TDelegate, TMethod extends keyof TDelegate> = TDelegate[TMethod] extends (
  ...args: any[]
) => infer R
  ? R
  : never;

export abstract class TenantScopedRepository<TDelegate extends Record<string, any>> {
  protected constructor(protected readonly prisma: PrismaService) {}

  protected abstract get model(): TDelegate;

  protected tenantIdOrThrow(): string {
    return this.prisma.getTenantIdOrThrow();
  }

  protected get tenantId(): string | undefined {
    return this.prisma.getTenantId();
  }

  async findUnique<TArgs extends DelegateMethodArgs<TDelegate, 'findUnique'>[0]>(
    args: TArgs,
  ): Promise<DelegateMethodReturn<TDelegate, 'findUnique'>> {
    return this.model.findUnique(args);
  }

  async findMany<TArgs extends DelegateMethodArgs<TDelegate, 'findMany'>[0]>(
    args?: TArgs,
  ): Promise<DelegateMethodReturn<TDelegate, 'findMany'>> {
    return this.model.findMany(args);
  }

  async create<TArgs extends DelegateMethodArgs<TDelegate, 'create'>[0]>(
    args: TArgs,
  ): Promise<DelegateMethodReturn<TDelegate, 'create'>> {
    this.tenantIdOrThrow();
    return this.model.create(args);
  }

  async update<TArgs extends DelegateMethodArgs<TDelegate, 'update'>[0]>(
    args: TArgs,
  ): Promise<DelegateMethodReturn<TDelegate, 'update'>> {
    this.tenantIdOrThrow();
    return this.model.update(args);
  }

  async delete<TArgs extends DelegateMethodArgs<TDelegate, 'delete'>[0]>(
    args: TArgs,
  ): Promise<DelegateMethodReturn<TDelegate, 'delete'>> {
    this.tenantIdOrThrow();
    return this.model.delete(args);
  }
}
