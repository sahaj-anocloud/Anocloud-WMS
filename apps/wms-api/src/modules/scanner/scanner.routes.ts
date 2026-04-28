import type { FastifyInstance } from 'fastify';
import { ScannerService, type OfflineTransaction } from './scanner.service.js';
import { LPNService } from '../lpns/lpn.service.js';
import { QuarantineService } from '../quarantine/quarantine.service.js';

export default async function scannerRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new ScannerService(fastify.db);
  const lpnSvc = new LPNService(fastify.db);
  const quarantineSvc = new QuarantineService(fastify.db, fastify.sqsClient);

  // POST /api/v1/scanner/gate-entry — vehicle registration. Req 7.1
  fastify.post('/api/v1/scanner/gate-entry', async (request, reply) => {
    const user = request.user;
    const body = request.body as {
      vehicle_reg: string;
      vendor_id: string;
      po_reference?: string;
      asn_reference?: string;
    };
    const result = await svc.gateEntry({
      vehicle_reg: body.vehicle_reg,
      vendor_id: body.vendor_id,
      ...(body.po_reference !== undefined && { po_reference: body.po_reference }),
      ...(body.asn_reference !== undefined && { asn_reference: body.asn_reference }),
      dc_id: user.dc_id,
      user_id: user.user_id,
      device_id: request.headers['x-device-id'] as string ?? 'unknown',
    });
    return reply.code(201).send(result);
  });

  // GET /api/v1/scanner/delivery/:id — ASN line items for scanner display. Req 7.2
  fastify.get('/api/v1/scanner/delivery/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const delivery = await svc.getDelivery(id, request.user.dc_id);
      return reply.code(200).send(delivery);
    } catch (err: unknown) {
      if (err instanceof Error && (err as { code?: string }).code === 'DELIVERY_NOT_FOUND') {
        return reply.code(404).send({ error: 'DELIVERY_NOT_FOUND' });
      }
      throw err;
    }
  });

  // POST /api/v1/scanner/scan — submit barcode scan, response within 1s. Req 8.1–8.8
  fastify.post('/api/v1/scanner/scan', async (request, reply) => {
    const user = request.user;
    const body = request.body as { delivery_line_id: string; barcode: string };
    try {
      const result = await svc.processScan({
        delivery_line_id: body.delivery_line_id,
        barcode: body.barcode,
        dc_id: user.dc_id,
        user_id: user.user_id,
        device_id: request.headers['x-device-id'] as string ?? 'unknown',
      });
      return reply.code(200).send(result);
    } catch (err: unknown) {
      if (err instanceof Error && (err as { code?: string }).code === 'LINE_NOT_FOUND') {
        return reply.code(404).send({ error: 'LINE_NOT_FOUND' });
      }
      throw err;
    }
  });

  // POST /api/v1/scanner/qc-pass/:line_id — blocked until scan count met. Req 8.5
  fastify.post('/api/v1/scanner/qc-pass/:line_id', async (request, reply) => {
    const user = request.user;
    const { line_id } = request.params as { line_id: string };
    try {
      await svc.qcPass({
        line_id,
        dc_id: user.dc_id,
        user_id: user.user_id,
        device_id: request.headers['x-device-id'] as string ?? 'unknown',
      });
      return reply.code(200).send({ line_id, qc_status: 'Passed' });
    } catch (err: unknown) {
      if (err instanceof Error && (err as { code?: string }).code === 'SCAN_COUNT_NOT_MET') {
        return reply.code(400).send({ error: 'SCAN_COUNT_NOT_MET', message: err.message });
      }
      if (err instanceof Error && (err as { code?: string }).code === 'LINE_NOT_FOUND') {
        return reply.code(404).send({ error: 'LINE_NOT_FOUND' });
      }
      throw err;
    }
  });

  // POST /api/v1/scanner/batch-capture — batch number + expiry date. Req 8.6
  fastify.post('/api/v1/scanner/batch-capture', async (request, reply) => {
    const user = request.user;
    const body = request.body as {
      line_id: string;
      batch_number: string;
      expiry_date: string;
    };
    await svc.batchCapture({
      line_id: body.line_id,
      batch_number: body.batch_number,
      expiry_date: body.expiry_date,
      dc_id: user.dc_id,
      user_id: user.user_id,
      device_id: request.headers['x-device-id'] as string ?? 'unknown',
    });
    return reply.code(200).send({ line_id: body.line_id, status: 'captured' });
  });

  // POST /api/v1/scanner/lpn/print — LPN generation + printing. Req 13.1–13.8
  fastify.post('/api/v1/scanner/lpn/print', async (request, reply) => {
    const user = request.user;
    const body = request.body as {
      dc_code: string;
      sku_id: string;
      batch_number?: string;
      expiry_date?: string;
      location?: string;
      delivery_line_id?: string;
      printer_host?: string;
    };
    const lpn = await lpnSvc.generateLPN({
      dcCode: body.dc_code,
      skuId: body.sku_id,
      ...(body.batch_number !== undefined && { batchNumber: body.batch_number }),
      ...(body.expiry_date !== undefined && { expiryDate: body.expiry_date }),
      ...(body.location !== undefined && { location: body.location }),
      ...(body.delivery_line_id !== undefined && { deliveryLineId: body.delivery_line_id }),
      userId: user.user_id,
      deviceId: request.headers['x-device-id'] as string ?? 'unknown',
      dcId: user.dc_id,
      ...(body.printer_host !== undefined && { printerHost: body.printer_host }),
    });
    return reply.code(201).send(lpn);
  });

  // POST /api/v1/scanner/quarantine — place stock in quarantine. Req 14.1–14.5
  fastify.post('/api/v1/scanner/quarantine', async (request, reply) => {
    const user = request.user;
    const body = request.body as {
      sku_id: string;
      lpn_id?: string;
      quantity: number;
      reason_code: string;
      is_perishable?: boolean;
    };
    const record = await quarantineSvc.placeQuarantine({
      dcId: user.dc_id,
      skuId: body.sku_id,
      ...(body.lpn_id !== undefined && { lpnId: body.lpn_id }),
      quantity: body.quantity,
      reasonCode: body.reason_code,
      userId: user.user_id,
      deviceId: request.headers['x-device-id'] as string ?? 'unknown',
      ...(body.is_perishable !== undefined && { isPerishable: body.is_perishable }),
    });
    return reply.code(201).send(record);
  });

  // POST /api/v1/scanner/offline-sync — batch offline transaction replay. Req 20.10–20.12
  fastify.post('/api/v1/scanner/offline-sync', async (request, reply) => {
    const body = request.body as { transactions: OfflineTransaction[] };

    if (!Array.isArray(body.transactions) || body.transactions.length === 0) {
      return reply.code(400).send({ error: 'EMPTY_PAYLOAD' });
    }

    const results = await svc.offlineSync(body.transactions);
    return reply.code(200).send({ results });
  });
}
