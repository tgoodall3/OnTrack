import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly requestContext: RequestContextService) {
    super({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    const getTenantId = () => this.requestContext.context.tenantId;
    const extension = this.$extends({
      name: 'tenantScoped',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!isTenantScopedModel(model)) {
              return query(args);
            }

            const tenantId = getTenantId();
            if (!tenantId) {
              return query(args);
            }

            switch (operation) {
              case 'findUnique':
              case 'findUniqueOrThrow':
              case 'findFirst':
              case 'findFirstOrThrow':
              case 'findMany':
              case 'count':
              case 'aggregate':
              case 'groupBy':
              case 'delete':
              case 'deleteMany':
              case 'update':
              case 'updateMany':
                args.where = applyTenantFilter(args.where, tenantId);
                break;
              case 'create':
                args.data = applyTenantToData(args.data, tenantId);
                break;
              case 'createMany':
                args.data = applyTenantToData(args.data, tenantId);
                break;
              case 'upsert':
                args.where = applyTenantFilter(args.where, tenantId);
                args.create = applyTenantToData(args.create, tenantId);
                args.update = applyTenantToData(args.update, tenantId, false);
                break;
              default:
                break;
            }

            return query(args);
          },
        },
      },
    });

    Object.assign(this, extension);
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to database...');
    this.logger.log(
      `DATABASE_URL=${process.env.DATABASE_URL ?? '(undefined)'}`,
    );

    await this.$connect();
    this.logger.log('Database connection established.');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting database...');
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.on('beforeExit', async () => {
      this.logger.warn(
        'Process beforeExit triggered, closing Nest application gracefully.',
      );
      await app.close();
    });
  }

  getTenantId(): string | undefined {
    return this.requestContext.context.tenantId;
  }

  getTenantIdOrThrow(): string {
    const tenantId = this.getTenantId();
    if (!tenantId)
      throw new UnauthorizedException(
        'Missing tenant context for database operation',
      );
    return tenantId;
  }
}

const TENANT_SCOPED_MODELS = new Set<Prisma.ModelName>([
  'ActivityLog',
  'ChecklistItem',
  'ChecklistTemplate',
  'Contact',
  'Estimate',
  'EstimateApproval',
  'EstimateLineItem',
  'EstimateTemplate',
  'EstimateTemplateItem',
  'File',
  'Invoice',
  'Job',
  'Lead',
  'MaterialUsage',
  'Notification',
  'Payment',
  'Property',
  'Role',
  'RolePermission',
  'SavedView',
  'Task',
  'TaskChecklistItem',
  'TimeEntry',
  'User',
  'UserRole',
]);

function isTenantScopedModel(model: string): model is Prisma.ModelName {
  return TENANT_SCOPED_MODELS.has(model as Prisma.ModelName);
}

function applyTenantFilter<T extends Record<string, unknown> | undefined>(
  where: T,
  tenantId: string,
): T {
  if (!where) {
    return { tenantId } as unknown as T;
  }

  if (Array.isArray(where)) {
    return where;
  }

  const existing = (where as Record<string, unknown>).tenantId;
  if (!existing) {
    return {
      ...where,
      tenantId,
    };
  }

  if (typeof existing === 'object' && existing !== null) {
    return {
      ...where,
      tenantId: {
        ...existing,
        equals: tenantId,
      },
    };
  }

  return where;
}

function applyTenantToData<T>(
  data: T,
  tenantId: string,
  allowOverride = true,
): T {
  if (Array.isArray(data)) {
    return data.map((record) =>
      applyTenantToData(record, tenantId, allowOverride),
    ) as T;
  }

  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const record = data as Record<string, unknown>;
  const hasTenantRelation = Object.prototype.hasOwnProperty.call(
    record,
    'tenant',
  );

  if ((!allowOverride || record.tenantId === undefined) && !hasTenantRelation) {
    return {
      ...record,
      tenantId,
    } as T;
  }

  return data;
}
