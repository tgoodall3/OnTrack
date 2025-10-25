import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService, DashboardMetrics } from './dashboard.service';
import { TenantGuard } from '../tenancy/tenant.guard';

@Controller('dashboard')
@UseGuards(TenantGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async summary(): Promise<DashboardMetrics> {
    return this.dashboardService.getDashboardMetrics();
  }
}
