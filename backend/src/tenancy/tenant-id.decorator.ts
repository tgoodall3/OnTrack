import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

interface TenantAwareRequest extends Request {
  tenantId?: string;
}

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<TenantAwareRequest>();
    return request.tenantId;
  },
);
