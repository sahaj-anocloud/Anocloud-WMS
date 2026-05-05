/**
 * Notification Worker — processes pending alert_deliveries and sends
 * Email / SMS notifications via NotificationService.
 *
 * Runs every 30 seconds. Picks up to 50 pending deliveries per cycle.
 * Marks each delivery as 'Sent' on success or 'Failed' on error.
 *
 * Req 17.1–17.5: Alert delivery infrastructure
 */

import type { Pool } from 'pg';
import { NotificationService } from '../modules/alerts/notification.service.js';

interface PendingDelivery {
  delivery_id: string;
  alert_id: string;
  target_user_id: string;
  channel: string;
  dc_id: string;
  alert_type: string;
  severity: string;
  payload: Record<string, unknown>;
  vendor_id?: string;
}

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const BATCH_SIZE = 50;

export function startNotificationWorker(db: Pool): NodeJS.Timeout {
  const notifier = new NotificationService(db);

  const run = async () => {
    try {
      // Fetch pending deliveries with user contact info joined
      const result = await db.query<PendingDelivery>(
        `SELECT
           ad.delivery_id,
           ad.alert_id,
           ad.target_user_id::text,
           ad.channel,
           a.dc_id,
           a.alert_type,
           a.severity,
           a.payload,
           (a.payload->>'vendor_id') as vendor_id
         FROM alert_deliveries ad
         JOIN alerts a ON a.alert_id = ad.alert_id
         WHERE ad.status = 'Pending'
         ORDER BY a.triggered_at ASC
         LIMIT $1`,
        [BATCH_SIZE],
      );

      if (result.rows.length === 0) return;

      for (const delivery of result.rows) {
        try {
          await processDelivery(db, notifier, delivery);
          await db.query(
            `UPDATE alert_deliveries SET status = 'Sent', sent_at = now() WHERE delivery_id = $1`,
            [delivery.delivery_id],
          );
        } catch (err) {
          console.error(`[notification-worker] Failed delivery ${delivery.delivery_id}:`, err);
          // Mark as Failed so it doesn't keep retrying indefinitely
          await db.query(
            `UPDATE alert_deliveries SET status = 'Failed' WHERE delivery_id = $1`,
            [delivery.delivery_id],
          ).catch(() => {}); // Non-blocking
        }
      }
    } catch (err) {
      console.error('[notification-worker] Poll cycle error:', err);
    }
  };

  // Run immediately on startup, then on interval
  void run();
  return setInterval(run, POLL_INTERVAL_MS);
}

async function processDelivery(
  db: Pool,
  notifier: NotificationService,
  delivery: PendingDelivery,
): Promise<void> {
  const { channel, target_user_id, dc_id, alert_type, payload, vendor_id } = delivery;

  if (channel === 'Email') {
    // Look up user email
    const userResult = await db.query<{ email: string }>(
      `SELECT email FROM user_profiles WHERE user_id = $1`,
      [target_user_id],
    );
    const email = userResult.rows[0]?.email;
    if (email) {
      await notifier.sendEmail(email, alert_type, payload, dc_id);
    } else {
      console.warn(`[notification-worker] No email for user ${target_user_id} — skipping`);
    }

    // Also email vendor contact if this is a vendor-related alert
    if (vendor_id) {
      const vendorResult = await db.query<{ contact_email: string }>(
        `SELECT contact_email FROM vendors WHERE vendor_id = $1`,
        [vendor_id],
      );
      const vendorEmail = vendorResult.rows[0]?.contact_email;
      if (vendorEmail) {
        await notifier.sendEmail(vendorEmail, alert_type, payload, dc_id);
      }
    }
  } else if (channel === 'SMS') {
    // Look up user phone
    const userResult = await db.query<{ phone: string }>(
      `SELECT phone FROM user_profiles WHERE user_id = $1`,
      [target_user_id],
    );
    const phone = userResult.rows[0]?.phone;
    if (phone) {
      await notifier.sendSMS(phone, alert_type, payload, dc_id);
    } else {
      console.warn(`[notification-worker] No phone for user ${target_user_id} — skipping`);
    }

    // Also WhatsApp vendor for critical alerts
    if (vendor_id && delivery.severity === 'Critical') {
      const vendorResult = await db.query<{ contact_phone: string }>(
        `SELECT contact_phone FROM vendors WHERE vendor_id = $1`,
        [vendor_id],
      );
      const vendorPhone = vendorResult.rows[0]?.contact_phone;
      if (vendorPhone) {
        await notifier.sendWhatsApp(vendorPhone, alert_type, payload, dc_id);
      }
    }
  }
  // InApp channel: no-op here — frontend polls /api/v1/alerts
}
