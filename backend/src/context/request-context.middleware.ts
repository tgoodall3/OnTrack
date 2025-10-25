import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';
import { randomUUID } from 'crypto';

const TENANT_HEADER = 'x-tenant-id';
const USER_HEADER = 'x-user-id';
const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestContextMiddleware.name);

  constructor(private readonly context: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers[REQUEST_ID_HEADER] as string | undefined) ?? randomUUID();
    const tenantId = req.headers[TENANT_HEADER] as string | undefined;
    const userId = req.headers[USER_HEADER] as string | undefined;

    this.context.run({ requestId, tenantId, userId }, () => {
      (
        req as Request & {
          requestId?: string;
          tenantId?: string;
          userId?: string;
        }
      ).requestId = requestId;
      (req as Request & { tenantId?: string }).tenantId = tenantId;
      (req as Request & { userId?: string }).userId = userId;

      res.setHeader(REQUEST_ID_HEADER, requestId);

      if (!tenantId) {
        this.logger.debug(
          `Request ${requestId} missing ${TENANT_HEADER} header`,
        );
      }

      next();
    });
  }
}
