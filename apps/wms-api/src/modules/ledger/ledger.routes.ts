import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../plugins/rbac.js';
import { LedgerService } from './ledger.service.js';
import type { StockState, TransactionType } from './ledger.service.js';

export default async function ledgerRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new LedgerService(fastify.db, fastify.sqsClient);

  // GET /api/v1/ledger/list — paginated bulk ledger view for all SKUs in a DC
  fastify.get(
    '/api/v1/ledger/list',
    { preHandler: requireRole('Inventory_Controller', 'Finance_User', 'Admin_User', 'Inbound_Supervisor', 'Vendor_User') },
    async (request, reply) => {
      const query  = request.query as { page?: string; limit?: string; search?: string };
      const page   = Math.max(1, parseInt(query.page  ?? '1',  10));
      const limit  = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10)));
      const offset = (page - 1) * limit;
      const search = query.search?.trim() ?? '';

      try {
        const searchClause = search ? `AND (s.sku_code ILIKE $4 OR s.name ILIKE $4)` : '';
        const params: (string | number)[] = [request.user.dc_id, limit, offset];
        if (search) params.push(`%${search}%`);

        const result = await fastify.db.query(
          `SELECT
             il.sku_id,
             s.sku_code,
             s.name,
             s.category,
             s.is_ft,
             s.is_perishable,
             il.stock_state,
             SUM(il.quantity) AS quantity,
             MAX(il.updated_at) AS last_updated
           FROM inventory_ledger il
           JOIN skus s ON s.sku_id = il.sku_id
           WHERE il.dc_id = $1 ${searchClause}
           GROUP BY il.sku_id, s.sku_code, s.name, s.category, s.is_ft, s.is_perishable, il.stock_state
           ORDER BY s.sku_code, il.stock_state
           LIMIT $2 OFFSET $3`,
          params,
        );

        const countParams: (string)[] = [request.user.dc_id];
        if (search) countParams.push(`%${search}%`);
        const countResult = await fastify.db.query(
          `SELECT COUNT(DISTINCT il.sku_id) AS total
           FROM inventory_ledger il
           JOIN skus s ON s.sku_id = il.sku_id
           WHERE il.dc_id = $1 ${search ? 'AND (s.sku_code ILIKE $2 OR s.name ILIKE $2)' : ''}`,
          countParams,
        );

        return reply.code(200).send({
          data: result.rows,
          total: parseInt(countResult.rows[0]?.total ?? '0', 10),
          page,
          limit,
        });
      } catch (err: unknown) {
        fastify.log.warn({ err }, 'ledger/list DB query failed — returning empty');
        return reply.code(200).send({ data: [], total: 0, page, limit });
      }
    },
  );

  // GET /api/v1/ledger/:sku_id/balance — current balance per stock state
  fastify.get(
    '/api/v1/ledger/:sku_id/balance',
    { preHandler: requireRole('Inventory_Controller', 'Finance_User', 'Admin_User', 'Inbound_Supervisor') },
    async (request, reply) => {
      const { sku_id } = request.params as { sku_id: string };
      try {
        const balance = await svc.getBalance(request.user.dc_id, sku_id);
        return reply.code(200).send({ sku_id, dc_id: request.user.dc_id, balance });
      } catch (err: unknown) {
        fastify.log.warn({ err }, `ledger/balance failed for ${sku_id}`);
        return reply.code(200).send({ sku_id, dc_id: request.user.dc_id, balance: [] });
      }
    },
  );

  // POST /api/v1/ledger/update — manual ledger adjustment (Inventory_Controller)
  fastify.post(
    '/api/v1/ledger/update',
    { preHandler: requireRole('Inventory_Controller', 'Admin_User') },
    async (request, reply) => {
      const body = request.body as {
        sku_id: string;
        from_state?: StockState;
        to_state: StockState;
        quantity: number;
        txn_type: TransactionType;
        reference_doc?: string;
      };
      try {
        await svc.updateLedger({
          dcId: request.user.dc_id,
          skuId: body.sku_id,
          toState: body.to_state,
          quantity: body.quantity,
          txnType: body.txn_type,
          performedBy: request.user.user_id,
          ...(body.from_state && { fromState: body.from_state }),
          ...(body.reference_doc && { referenceDoc: body.reference_doc }),
        });
        return reply.code(200).send({ status: 'updated' });
      } catch (err: unknown) {
        fastify.log.warn({ err }, 'ledger/update failed');
        return reply.code(503).send({ error: 'LEDGER_UPDATE_FAILED' });
      }
    },
  );

  // POST /api/v1/ledger/reconcile — trigger live SAP reconciliation
  fastify.post(
    '/api/v1/ledger/reconcile',
    { preHandler: requireRole('Inventory_Controller', 'Admin_User') },
    async (request, reply) => {
      try {
        const rows = await svc.reconcileWithSAP(request.user.dc_id);
        return reply.code(200).send(rows);
      } catch (err: unknown) {
        fastify.log.warn({ err }, 'ledger/reconcile failed');
        return reply.code(200).send([]);
      }
    },
  );
}
