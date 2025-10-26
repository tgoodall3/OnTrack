import { Module } from '@nestjs/common';
import { RequestContextModule } from '../context/request-context.module';
import { UsersService } from './users.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersController } from './users.controller';
import { TenantGuard } from '../tenancy/tenant.guard';

@Module({
  imports: [RequestContextModule, PrismaModule],
  controllers: [UsersController],
  providers: [UsersService, TenantGuard],
  exports: [UsersService],
})
export class UsersModule {}
