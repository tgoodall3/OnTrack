import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstimateStatus, Prisma } from '@prisma/client';
import { createTransport, Transporter } from 'nodemailer';
import { SendEstimateDto } from './dto/send-estimate.dto';
import { AppConfig } from '../config/app.config';

type EstimateForEmail = {
  id: string;
  number: string;
  status: EstimateStatus;
  subtotal: Prisma.Decimal | number;
  tax: Prisma.Decimal | number;
  total: Prisma.Decimal | number;
  lead: {
    contact?: {
      name?: string | null;
    } | null;
  };
  lineItems: Array<{
    description: string;
    quantity: Prisma.Decimal | number;
    unitPrice: Prisma.Decimal | number;
    total?: Prisma.Decimal | number;
  }>;
};

export interface EstimateEmailResult {
  subject: string;
  htmlPreview: string;
  messageId?: string;
}

@Injectable()
export class EstimateMailerService {
  private readonly logger = new Logger(EstimateMailerService.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const mailConfig = this.configService.get('mail', { infer: true });
    this.fromAddress = mailConfig.from;
    this.transporter = createTransport({
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      auth:
        mailConfig.user && mailConfig.pass
          ? { user: mailConfig.user, pass: mailConfig.pass }
          : undefined,
    });
  }

  async sendEstimateEmail(
    estimate: EstimateForEmail,
    payload: SendEstimateDto,
    options?: {
      pdf?: {
        buffer: Buffer;
        fileName: string;
      };
    },
  ): Promise<EstimateEmailResult> {
    const subject = `Estimate ${estimate.number} from OnTrack`;
    const htmlPreview = this.renderHtmlPreview(estimate, payload);

    const attachments =
      options?.pdf?.buffer && options.pdf.fileName
        ? [
            {
              filename: options.pdf.fileName,
              content: options.pdf.buffer,
              contentType: 'application/pdf',
            },
          ]
        : undefined;

    const textBody = this.renderTextPreview(estimate, payload);

    const response = await this.transporter.sendMail({
      from: this.fromAddress,
      to: payload.recipientEmail,
      subject,
      html: htmlPreview,
      text: textBody,
      attachments,
    });

    this.logger.log(
      `Estimate ${estimate.id} sent to ${payload.recipientEmail} (messageId=${response.messageId}).`,
    );

    return { subject, htmlPreview, messageId: response.messageId };
  }

  private renderHtmlPreview(
    estimate: EstimateForEmail,
    payload: SendEstimateDto,
  ): string {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    });

    const contactName =
      estimate.lead.contact?.name ??
      payload.recipientName ??
      payload.recipientEmail;

    const rows = estimate.lineItems
      .map((item) => {
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        const total =
          item.total !== undefined ? Number(item.total) : quantity * unitPrice;

        return `
          <tr>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;">${item.description}</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right;">${quantity}</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right;">${formatter.format(
              unitPrice,
            )}</td>
            <td style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right;">${formatter.format(
              total,
            )}</td>
          </tr>
        `;
      })
      .join('');

    const subtotal = formatter.format(Number(estimate.subtotal));
    const tax = formatter.format(Number(estimate.tax));
    const total = formatter.format(Number(estimate.total));

    const messageSection = payload.message
      ? `<p style="margin:16px 0 24px 0; font-size:14px; color:#374151;">${payload.message}</p>`
      : '';

    return `
      <div style="font-family:Segoe UI, sans-serif; max-width:640px; margin:0 auto; color:#111827;">
        <h1 style="font-size:22px; margin-bottom:4px;">Estimate ${estimate.number}</h1>
        <p style="margin:0 0 12px 0; font-size:14px; color:#6b7280;">Hi ${contactName ?? 'there'},</p>
        ${messageSection}
        <table style="border-collapse:collapse; width:100%; font-size:14px;">
          <thead style="background:#f3f4f6;">
            <tr>
              <th style="text-align:left; padding:8px 12px; border:1px solid #e5e7eb;">Item</th>
              <th style="text-align:right; padding:8px 12px; border:1px solid #e5e7eb;">Qty</th>
              <th style="text-align:right; padding:8px 12px; border:1px solid #e5e7eb;">Unit</th>
              <th style="text-align:right; padding:8px 12px; border:1px solid #e5e7eb;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div style="margin-top:18px; text-align:right; font-size:14px;">
          <p style="margin:4px 0;">Subtotal: <strong>${subtotal}</strong></p>
          <p style="margin:4px 0;">Tax: <strong>${tax}</strong></p>
          <p style="margin:8px 0; font-size:16px;">Total: <strong>${total}</strong></p>
        </div>
        <p style="margin-top:24px; font-size:12px; color:#6b7280;">This is a preview generated by OnTrack. PDF delivery will be available soon.</p>
      </div>
    `;
  }

  private renderTextPreview(
    estimate: EstimateForEmail,
    payload: SendEstimateDto,
  ): string {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    });

    const lines = [
      `Estimate ${estimate.number}`,
      `Status: ${estimate.status}`,
      `Subtotal: ${formatter.format(Number(estimate.subtotal))}`,
      `Tax: ${formatter.format(Number(estimate.tax))}`,
      `Total: ${formatter.format(Number(estimate.total))}`,
      '',
      payload.message ?? '',
    ];

    return lines.filter((line) => line !== undefined).join('\n');
  }
}
