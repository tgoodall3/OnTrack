import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ContactsService, ContactSummary } from './contacts.service';
import { ListContactsDto } from './dto/list-contacts.dto';
import { TenantGuard } from '../tenancy/tenant.guard';

@Controller('contacts')
@UseGuards(TenantGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  async list(@Query() query: ListContactsDto): Promise<ContactSummary[]> {
    return this.contactsService.list(query);
  }
}
