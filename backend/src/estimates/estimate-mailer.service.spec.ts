import { ConfigService } from '@nestjs/config';
import { EstimateStatus, Prisma } from '@prisma/client';
import { EstimateMailerService } from './estimate-mailer.service';
import { AppConfig } from '../config/app.config';
import { SendEstimateDto } from './dto/send-estimate.dto';

type EstimateEmailInput = Parameters<
  EstimateMailerService['sendEstimateEmail']
>[0];

const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
  })),
}));

const { createTransport } = jest.requireMock('nodemailer');

describe('EstimateMailerService', () => {
  const mailConfig: AppConfig['mail'] = {
    host: '127.0.0.1',
    port: 2525,
    secure: false,
    user: undefined,
    pass: undefined,
    from: 'OnTrack <no-reply@ontrack.test>',
  };

  const baseEstimate: EstimateEmailInput = {
    id: 'est_123',
    number: 'EST-001',
    status: EstimateStatus.DRAFT,
    subtotal: new Prisma.Decimal(1000),
    tax: new Prisma.Decimal(82.5),
    total: new Prisma.Decimal(1082.5),
    lead: {
      contact: {
        name: 'Tyler Contractor',
      },
    },
    lineItems: [
      {
        description: 'Demo line',
        quantity: new Prisma.Decimal(1),
        unitPrice: new Prisma.Decimal(1000),
      },
    ],
  } as const;

  const basePayload: SendEstimateDto = {
    recipientEmail: 'client@example.com',
    recipientName: 'Client',
    message: 'Please review this proposal.',
  };

  let service: EstimateMailerService;
  let configService: ConfigService<AppConfig>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: 'stubbed-id' });
    configService = {
      get: jest.fn().mockReturnValue(mailConfig),
    } as unknown as ConfigService<AppConfig>;

    service = new EstimateMailerService(configService);
  });

  it('configures nodemailer transport from config service', async () => {
    await service.sendEstimateEmail(baseEstimate, basePayload);

    expect(configService.get).toHaveBeenCalledWith('mail', { infer: true });
    expect(createTransport).toHaveBeenCalledWith({
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      auth: undefined,
    });
  });

  it('sends estimate email with pdf attachment metadata when provided', async () => {
    const pdf = {
      buffer: Buffer.from('PDF'),
      fileName: 'estimate.pdf',
    };

    const result = await service.sendEstimateEmail(baseEstimate, basePayload, {
      pdf,
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const args = mockSendMail.mock.calls[0][0];

    expect(args).toMatchObject({
      from: mailConfig.from,
      to: basePayload.recipientEmail,
      subject: expect.stringContaining(baseEstimate.number),
      text: expect.stringContaining('Subtotal'),
      html: expect.stringContaining('Estimate EST-001'),
    });

    expect(args.attachments).toEqual([
      {
        filename: pdf.fileName,
        content: pdf.buffer,
        contentType: 'application/pdf',
      },
    ]);
    expect(result.messageId).toBe('stubbed-id');
    expect(result.subject).toContain(baseEstimate.number);
  });

  it('omits attachments when pdf buffer is not provided', async () => {
    await service.sendEstimateEmail(baseEstimate, basePayload);

    const args = mockSendMail.mock.calls[0][0];
    expect(args.attachments).toBeUndefined();
  });
});
