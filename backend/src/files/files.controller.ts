import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TenantGuard } from '../tenancy/tenant.guard';
import { FilesService } from './files.service';
import { CreateUploadDto } from './dto/create-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';

@Controller()
@UseGuards(TenantGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('files/uploads')
  async createUpload(@Body() dto: CreateUploadDto) {
    return this.filesService.createUpload(dto);
  }

  @Post('files')
  async finalizeUpload(@Body() dto: CompleteUploadDto) {
    return this.filesService.finalizeUpload(dto);
  }

  @Get('jobs/:id/files')
  async listForJob(@Param('id') jobId: string) {
    return this.filesService.listForJob(jobId);
  }

  @Get('estimates/:id/files')
  async listForEstimate(@Param('id') estimateId: string) {
    return this.filesService.listForEstimate(estimateId);
  }

  @Delete('files/:id')
  async remove(@Param('id') fileId: string) {
    await this.filesService.remove(fileId);
    return { deleted: true };
  }
}
