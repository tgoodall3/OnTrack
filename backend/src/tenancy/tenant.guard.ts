import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { RequestContextService } from '../context/request-context.service';
import { PrismaService } from '../prisma/prisma.service';

type TenantAwareRequest = Request & { tenantId?: string };

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly context: RequestContextService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantAwareRequest>();
    const tenantIdentifier = request.tenantId ?? this.context.context.tenantId;

    if (!tenantIdentifier) {
      throw new UnauthorizedException('Missing tenant identifier');
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [{ id: tenantIdentifier }, { slug: tenantIdentifier }],
      },
      select: {
        id: true,
      },
    });

    if (!tenant) {
      throw new UnauthorizedException('Unknown tenant');
    }

    request.tenantId = tenant.id;
    this.context.setTenantId(tenant.id);
    return true;
  }
}
