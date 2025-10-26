import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UsersService, UserSummary } from './users.service';
import { ListUsersDto } from './dto/list-users.dto';
import { TenantGuard } from '../tenancy/tenant.guard';

@Controller('users')
@UseGuards(TenantGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(@Query() query: ListUsersDto): Promise<UserSummary[]> {
    return this.usersService.list(query);
  }
}
