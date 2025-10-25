import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly requestContext: RequestContextService) {
    super({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to database...');
    this.logger.log(`DATABASE_URL=${process.env.DATABASE_URL ?? '(undefined)'}`);

    await this.$connect();
    this.logger.log('Database connection established.');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting database...');
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.on('beforeExit', async () => {
      this.logger.warn('Process beforeExit triggered, closing Nest application gracefully.');
      await app.close();
    });
  }

  getTenantId(): string | undefined {
    return this.requestContext.context.tenantId;
  }

  getTenantIdOrThrow(): string {
    const tenantId = this.getTenantId();
    if (!tenantId) throw new UnauthorizedException('Missing tenant context for database operation');
    return tenantId;
  }
}
