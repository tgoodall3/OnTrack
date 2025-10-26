import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EstimatesService, EstimateSummary } from './estimates.service';
import { ListEstimatesDto } from './dto/list-estimates.dto';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { SendEstimateDto } from './dto/send-estimate.dto';
import { ApproveEstimateDto } from './dto/approve-estimate.dto';
import { TenantGuard } from '../tenancy/tenant.guard';

@Controller('estimates')
@UseGuards(TenantGuard)
export class EstimatesController {
  constructor(private readonly estimatesService: EstimatesService) {}

  @Get()
  async list(@Query() query: ListEstimatesDto): Promise<EstimateSummary[]> {
    return this.estimatesService.list(query);
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<EstimateSummary> {
    return this.estimatesService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateEstimateDto): Promise<EstimateSummary> {
    return this.estimatesService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEstimateDto,
  ): Promise<EstimateSummary> {
    return this.estimatesService.update(id, dto);
  }

  @Post(':id/send')
  async sendEstimate(
    @Param('id') id: string,
    @Body() dto: SendEstimateDto,
  ): Promise<EstimateSummary> {
    return this.estimatesService.send(id, dto);
  }

  @Post(':id/approve')
  async approveEstimate(
    @Param('id') id: string,
    @Body() dto: ApproveEstimateDto,
  ): Promise<EstimateSummary> {
    return this.estimatesService.approve(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    await this.estimatesService.remove(id);
  }
}
