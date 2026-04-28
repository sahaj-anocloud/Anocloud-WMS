import { Pool } from 'pg';

export interface NotificationPayload {
  to: string;
  subject?: string;
  body: string;
  dcId: string;
}

export class NotificationService {
  constructor(private readonly db: Pool) {}

  /**
   * Sends WhatsApp message to a vendor. Item #167.
   */
  async sendWhatsApp(to: string, message: string, dcId: string): Promise<void> {
    console.log(`[WhatsApp] Sending to ${to} (DC: ${dcId}): ${message}`);
    // Mock integration: log to DB for audit
    await this.logNotification(dcId, 'WhatsApp', to, message);
  }

  /**
   * Sends Email to a user or vendor. Item #167.
   */
  async sendEmail(to: string, subject: string, body: string, dcId: string): Promise<void> {
    console.log(`[Email] Sending to ${to} (DC: ${dcId}): ${subject}`);
    // Mock integration: log to DB for audit
    await this.logNotification(dcId, 'Email', to, body, subject);
  }

  private async logNotification(dcId: string, channel: string, recipient: string, body: string, subject?: string): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_events (dc_id, event_type, user_id, device_id, reference_doc, new_state, reason_code)
       VALUES ($1, 'NOTIFICATION_SENT', '00000000-0000-0000-0000-000000000000', 'system', $2, $3, $4)`,
      [dcId, recipient, JSON.stringify({ channel, subject, body }), 'Notification Sent']
    );
  }
}
