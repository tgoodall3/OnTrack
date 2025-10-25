import { Injectable } from '@nestjs/common';
import { ContactType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListContactsDto } from './dto/list-contacts.dto';

export interface ContactSummary {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  type: ContactType;
  leads: number;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListContactsDto): Promise<ContactSummary[]> {
    const take = params.take ?? 25;
    const where: Prisma.ContactWhereInput = {};

    if (params.type) {
      where.type = params.type;
    }

    if (params.search) {
      const search = params.search.trim();
      if (search.length) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    const contacts = await this.prisma.contact.findMany({
      where,
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
      take,
      include: {
        _count: {
          select: {
            leads: true,
          },
        },
      },
    });

    return contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      type: contact.type,
      leads: contact._count.leads,
    }));
  }
}
