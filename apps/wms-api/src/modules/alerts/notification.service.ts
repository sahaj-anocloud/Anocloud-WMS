/**
 * NotificationService — delivers alerts via Email (AWS SES) and SMS (AWS SNS).
 *
 * Channels supported:
 *   Email  → AWS SES SendEmail API
 *   SMS    → AWS SNS Publish (direct phone number, no topic needed)
 *   InApp  → no-op here; handled by the frontend polling /api/v1/alerts
 *
 * Configuration (env vars):
 *   SES_FROM_EMAIL      — verified sender address, e.g. alerts@sumosave.com
 *   SES_REGION          — AWS region for SES (may differ from main region)
 *   SNS_REGION          — AWS region for SNS
 *   AWS_REGION          — fallback region for both
 *   AWS_ACCESS_KEY_ID   — IAM credentials
 *   AWS_SECRET_ACCESS_KEY
 *
 * In dev/staging, LocalStack handles both SES and SNS at http://localhost:4566.
 * Set AWS_ENDPOINT_URL=http://localhost:4566 to redirect all AWS calls there.
 *
 * All sends are logged to audit_events for compliance traceability.
 */

import { Pool } from 'pg';
import {
  SESClient,
  SendEmailCommand,
  type SendEmailCommandInput,
} from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

// ─── Alert type → human-readable subject map ─────────────────────────────────

const ALERT_SUBJECTS: Record<string, string> = {
  VENDOR_DOC_EXPIRY:          'Action Required: Vendor Document Expiring Soon',
  GST_MISMATCH:               'Critical: GST Mismatch Detected — Delivery Blocked',
  GKM_SOFT_STOP:              'Warning: GKM Soft Stop — Price Variance Detected',
  GKM_HARD_STOP:              'Critical: GKM Hard Stop — Delivery Blocked',
  PERISHABLE_DWELL:           'Urgent: Perishable Item Dwell Time Exceeded',
  QUARANTINE_OPEN_4H:         'Alert: Quarantine Hold Open for 4+ Hours',
  VEHICLE_DWELL_60M:          'Notice: Vehicle Dwell Time Exceeded 60 Minutes',
  SAP_SYNC_DISCREPANCY:       'Warning: WMS vs SAP Stock Discrepancy Detected',
  UNEXPECTED_ITEM:            'Alert: Unexpected Item Scanned at Receiving',
  SAP_GRPO_FAILURE:           'Critical: SAP GRPO Posting Failed',
  VENDOR_PERFORMANCE_INCIDENT:'Notice: Vendor Performance Incident Recorded',
  PRODUCTIVITY_EXCEPTION:     'Notice: Scan Productivity Exception Detected',
  ASN_OVER_DELIVERY:          'Warning: Over-Delivery Detected on ASN',
  BARCODE_MISMATCH:           'Alert: Barcode Mismatch at QC Scan',
  SCAN_COMPLIANCE_BELOW_TARGET:'Notice: Scan Compliance Below Target',
};

// ─── Email template builder ───────────────────────────────────────────────────

function buildEmailBody(alertType: string, payload: Record<string, unknown>, dcId: string): string {
  const subject = ALERT_SUBJECTS[alertType] ?? `WMS Alert: ${alertType}`;
  const payloadLines = Object.entries(payload)
    .map(([k, v]) => `  <tr><td style="padding:4px 12px;color:#666;font-size:13px;">${k}</td><td style="padding:4px 12px;font-size:13px;font-weight:600;">${String(v)}</td></tr>`)
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background:#0a0f1e;padding:20px 24px;display:flex;align-items:center;gap:12px;">
      <div style="width:32px;height:32px;background:#00ff88;border-radius:6px;transform:rotate(12deg);"></div>
      <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.5px;">SUMOSAVE WMS</span>
    </div>
    <!-- Alert type badge -->
    <div style="padding:20px 24px 0;">
      <span style="display:inline-block;background:#fff3cd;color:#856404;border:1px solid #ffc107;border-radius:4px;padding:4px 10px;font-size:11px;font-weight:700;letter-spacing:0.5px;">${alertType}</span>
      <span style="display:inline-block;margin-left:8px;background:#f8f9fa;color:#6c757d;border:1px solid #dee2e6;border-radius:4px;padding:4px 10px;font-size:11px;">DC: ${dcId}</span>
    </div>
    <!-- Subject -->
    <div style="padding:12px 24px 0;">
      <h2 style="margin:0;font-size:20px;color:#1a1a2e;">${subject}</h2>
      <p style="margin:6px 0 0;color:#666;font-size:13px;">Triggered at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
    </div>
    <!-- Payload table -->
    <div style="padding:16px 24px;">
      <table style="width:100%;border-collapse:collapse;background:#f8f9fa;border-radius:6px;overflow:hidden;">
        <tbody>
          ${payloadLines}
        </tbody>
      </table>
    </div>
    <!-- CTA -->
    <div style="padding:0 24px 24px;">
      <a href="${process.env['PORTAL_URL'] ?? 'http://localhost:3001'}/alerts"
         style="display:inline-block;background:#00ff88;color:#0a0f1e;padding:10px 20px;border-radius:6px;font-weight:700;font-size:13px;text-decoration:none;">
        VIEW IN WMS PORTAL →
      </a>
    </div>
    <!-- Footer -->
    <div style="background:#f8f9fa;padding:12px 24px;border-top:1px solid #e9ecef;">
      <p style="margin:0;color:#aaa;font-size:11px;">SumoSave WMS · Automated Alert · Do not reply to this email</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── SMS template builder ─────────────────────────────────────────────────────

function buildSMSBody(alertType: string, payload: Record<string, unknown>, dcId: string): string {
  const subject = ALERT_SUBJECTS[alertType] ?? alertType;
  // Keep SMS under 160 chars for single-segment delivery
  const key = Object.keys(payload)[0];
  const val = key ? String(payload[key]).slice(0, 40) : '';
  return `[SumoSave WMS] ${subject.slice(0, 80)}${val ? ` | ${key}: ${val}` : ''} | DC:${dcId}`.slice(0, 160);
}

// ─── NotificationService ──────────────────────────────────────────────────────

export interface NotificationPayload {
  to: string;
  subject?: string;
  body: string;
  dcId: string;
}

export class NotificationService {
  private readonly ses: SESClient;
  private readonly sns: SNSClient;
  private readonly fromEmail: string;

  constructor(private readonly db: Pool) {
    const endpoint = process.env['AWS_ENDPOINT_URL']; // LocalStack in dev
    const region = process.env['AWS_REGION'] ?? 'ap-south-1';

    const clientConfig = {
      region,
      ...(endpoint ? { endpoint } : {}),
      credentials: {
        accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? 'test',
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? 'test',
      },
    };

    this.ses = new SESClient({
      ...clientConfig,
      region: process.env['SES_REGION'] ?? region,
    });

    this.sns = new SNSClient({
      ...clientConfig,
      region: process.env['SNS_REGION'] ?? region,
    });

    this.fromEmail = process.env['SES_FROM_EMAIL'] ?? 'alerts@sumosave.com';
  }

  /**
   * Sends an HTML email via AWS SES.
   * Falls back to console.log if SES is not configured (dev mode).
   */
  async sendEmail(
    to: string,
    alertType: string,
    payload: Record<string, unknown>,
    dcId: string,
  ): Promise<void> {
    const subject = ALERT_SUBJECTS[alertType] ?? `WMS Alert: ${alertType}`;
    const htmlBody = buildEmailBody(alertType, payload, dcId);
    const textBody = `${subject}\n\nDC: ${dcId}\n\n${Object.entries(payload).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nView in portal: ${process.env['PORTAL_URL'] ?? 'http://localhost:3001'}/alerts`;

    const params: SendEmailCommandInput = {
      Source: this.fromEmail,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          Text: { Data: textBody, Charset: 'UTF-8' },
        },
      },
      Tags: [
        { Name: 'alert_type', Value: alertType },
        { Name: 'dc_id', Value: dcId },
      ],
    };

    try {
      await this.ses.send(new SendEmailCommand(params));
      await this.logNotification(dcId, 'Email', to, subject, 'sent');
    } catch (err) {
      // In dev without SES configured, log and continue — don't crash the alert flow
      console.warn(`[NotificationService] Email send failed (to: ${to}):`, (err as Error).message);
      await this.logNotification(dcId, 'Email', to, subject, 'failed', (err as Error).message);
    }
  }

  /**
   * Sends an SMS via AWS SNS direct publish to a phone number.
   * Phone number must be in E.164 format: +91XXXXXXXXXX
   */
  async sendSMS(
    phoneNumber: string,
    alertType: string,
    payload: Record<string, unknown>,
    dcId: string,
  ): Promise<void> {
    // Normalise to E.164 — add +91 if bare 10-digit Indian number
    const e164 = phoneNumber.startsWith('+')
      ? phoneNumber
      : `+91${phoneNumber.replace(/\D/g, '').slice(-10)}`;

    const message = buildSMSBody(alertType, payload, dcId);

    try {
      await this.sns.send(
        new PublishCommand({
          PhoneNumber: e164,
          Message: message,
          MessageAttributes: {
            'AWS.SNS.SMS.SMSType': {
              DataType: 'String',
              StringValue: 'Transactional', // Highest delivery priority
            },
            'AWS.SNS.SMS.SenderID': {
              DataType: 'String',
              StringValue: 'SUMOWMS', // Up to 11 chars, alphanumeric
            },
          },
        }),
      );
      await this.logNotification(dcId, 'SMS', e164, message, 'sent');
    } catch (err) {
      console.warn(`[NotificationService] SMS send failed (to: ${e164}):`, (err as Error).message);
      await this.logNotification(dcId, 'SMS', e164, message, 'failed', (err as Error).message);
    }
  }

  /**
   * Sends a WhatsApp message via AWS SNS (same as SMS for now).
   * In production, replace with WhatsApp Business API (Meta / Twilio).
   */
  async sendWhatsApp(
    phoneNumber: string,
    alertType: string,
    payload: Record<string, unknown>,
    dcId: string,
  ): Promise<void> {
    // For now, fall back to SMS — swap this for WhatsApp Business API when available
    await this.sendSMS(phoneNumber, alertType, payload, dcId);
  }

  // ── Legacy overload kept for backward compatibility with alert.service.ts ──

  /**
   * @deprecated Use sendEmail(to, alertType, payload, dcId) instead.
   * Kept for backward compatibility with existing callers.
   */
  async sendEmailLegacy(to: string, subject: string, body: string, dcId: string): Promise<void> {
    await this.sendEmail(to, 'GENERIC_ALERT', { message: body }, dcId);
  }

  /**
   * @deprecated Use sendWhatsApp(phone, alertType, payload, dcId) instead.
   */
  async sendWhatsAppLegacy(to: string, message: string, dcId: string): Promise<void> {
    await this.sendSMS(to, 'GENERIC_ALERT', { message }, dcId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async logNotification(
    dcId: string,
    channel: string,
    recipient: string,
    subject: string,
    status: 'sent' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO audit_events
           (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
         VALUES ($1, 'NOTIFICATION_SENT', '00000000-0000-0000-0000-000000000000',
                 'notification-service', $2, $3::jsonb, $4)`,
        [
          dcId,
          recipient,
          JSON.stringify({ channel, subject, status, error: errorMessage ?? null }),
          status === 'sent' ? 'notification_delivered' : 'notification_failed',
        ],
      );
    } catch (dbErr) {
      // Non-blocking — don't let audit log failure crash notification delivery
      console.error('[NotificationService] Failed to log notification to audit:', dbErr);
    }
  }
}
