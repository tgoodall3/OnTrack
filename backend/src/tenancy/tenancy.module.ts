import { Module } from '@nestjs/common';
import { RequestContextModule } from '../context/request-context.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [RequestContextModule, PrismaModule],
  exports: [RequestContextModule, PrismaModule],
})
export class TenancyModule {}
