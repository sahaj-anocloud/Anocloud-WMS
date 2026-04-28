import { Pool, PoolClient } from 'pg';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { SendMessageCommand } from '@aws-sdk/client-sqs';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockState = 'Available' | 'Quarantined' | 'Held' | 'Rejected' | 'InTransit' | 'Disposed';
export type TransactionType = 'Receipt' | 'Quarantine' | 'Release' | 'Dispatch' | 'Disposal' | 'Adjustment';

export interface UpdateLedgerInput {
  dcId: string;
  skuId: string;
  fromState?: StockState;
  toState: StockState;
  quantity: number;
  txnType: TransactionType;
  referenceDoc?: string;
  performedBy: string;
}

export interface LedgerBalance {
  Available: number;
  Quarantined: number;
  Held: number;
  Rejected: number;
  InTransit: number;
  Disposed: number;
}

export interface StoreProfile {
  storeId: string;
  mbq: number;
  soh: number;
}

export interface AllocationResult {
  storeId: string;
  allocatedQty: number;
  demand: number;
}

export interface SAPStockRecord {
  sku_id: string;
  available_qty: number;
}

export interface ReconciliationRow {
  sku_id: string;
  sku_code: string;
  wms_available_qty: number;
  sap_available_qty: number;
  variance: number;
  variance_pct: number;
  flagged: boolean;
  checked_at: string;
}

// ─── Ledger Service ───────────────────────────────────────────────────────────

export class LedgerService {
  constructor(
    private readonly db: Pool,
    private readonly sqsClient?: SQSClient,
    private readonly alertQueueUrl: string = process.env['SQS_ALERT_QUEUE_URL'] ?? '',
    private readonly sapIntegrationUrl: string = process.env['SAP_INTEGRATION_URL'] ?? 'http://localhost:8080',
  ) {}

  /**
   * Atomically updates the inventory ledger.
   * Enforces balance equation and rejects negatives.
   * Writes stock_transactions record.
   * Req 15.1–15.3
   */
  async updateLedger(input: UpdateLedgerInput): Promise<void> {
    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Deduct from fromState
      if (input.fromState) {
        await this.adjustLedger(client, input.dcId, input.skuId, input.fromState, -input.quantity);
      }

      // Add to toState
      await this.adjustLedger(client, input.dcId, input.skuId, input.toState, input.quantity);

      // Validate balance equation
      await this.assertBalanceEquation(client, input.dcId, input.skuId);

      // Write stock_transactions record
      await client.query(
        `INSERT INTO stock_transactions
           (dc_id, sku_id, txn_type, from_state, to_state, quantity, reference_doc, performed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          input.dcId,
          input.skuId,
          input.txnType,
          input.fromState ?? null,
          input.toState,
          input.quantity,
          input.referenceDoc ?? null,
          input.performedBy,
        ],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Returns the current ledger balance for a SKU in a DC.
   */
  async getBalance(dcId: string, skuId: string): Promise<LedgerBalance> {
    const result = await this.db.query<{ stock_state: string; quantity: string }>(
      `SELECT stock_state, quantity
       FROM inventory_ledger
       WHERE dc_id = $1 AND sku_id = $2`,
      [dcId, skuId],
    );

    const balance: LedgerBalance = {
      Available: 0,
      Quarantined: 0,
      Held: 0,
      Rejected: 0,
      InTransit: 0,
      Disposed: 0,
    };

    for (const row of result.rows) {
      balance[row.stock_state as keyof LedgerBalance] = parseFloat(row.quantity);
    }

    return balance;
  }

  /**
   * FT Allocation (BR-17): on GRNComplete for FT item, immediately allocate
   * 100% of received qty to stores in equal shares.
   * Req 15.4
   */
  async allocateFT(
    dcId: string,
    skuId: string,
    deliveryId: string,
    receivedQty: number,
    storeIds: string[],
    performedBy: string,
  ): Promise<AllocationResult[]> {
    if (storeIds.length === 0) return [];

    const qtyPerStore = Math.floor((receivedQty / storeIds.length) * 1000) / 1000;
    const remainder = Math.round((receivedQty - qtyPerStore * storeIds.length) * 1000) / 1000;

    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');

      const results: AllocationResult[] = [];

      for (let i = 0; i < storeIds.length; i++) {
        const storeId = storeIds[i]!;
        const qty = i === 0 ? qtyPerStore + remainder : qtyPerStore;

        await client.query(
          `INSERT INTO store_allocations
             (dc_id, sku_id, store_id, delivery_id, allocated_qty, allocation_type)
           VALUES ($1,$2,$3,$4,$5,'FT')`,
          [dcId, skuId, storeId, deliveryId, qty],
        );

        results.push({ storeId, allocatedQty: qty, demand: 0 });
      }

      await client.query('COMMIT');
      return results;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * NFT Allocation (BR-17): compute demand = max(0, store.mbq - store.soh)
   * per store; allocate proportionally; assign remainder to highest-demand store.
   * If total demand = 0, hold all in DC.
   * Req 15.5, 15.6
   */
  async allocateNFT(
    dcId: string,
    skuId: string,
    deliveryId: string,
    receivedQty: number,
    stores: StoreProfile[],
    performedBy: string,
  ): Promise<AllocationResult[]> {
    // Compute demands
    const demands = stores.map((s) => ({
      storeId: s.storeId,
      demand: Math.max(0, s.mbq - s.soh),
      mbq: s.mbq,
      soh: s.soh,
    }));

    const totalDemand = demands.reduce((sum, d) => sum + d.demand, 0);

    // If total demand = 0, hold all in DC (no allocations)
    if (totalDemand === 0) {
      return [];
    }

    const client: PoolClient = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Sort by demand ASCENDING so remainder goes to the highest-demand store
      const sorted = [...demands].sort((a, b) => a.demand - b.demand);
      const results: AllocationResult[] = [];
      let allocated = 0;

      for (let i = 0; i < sorted.length; i++) {
        const d = sorted[i]!;
        if (d.demand === 0) {
          results.push({ storeId: d.storeId, allocatedQty: 0, demand: 0 });
          continue;
        }

        let qty: number;
        if (i === sorted.length - 1) {
          // Last store gets whatever is left (handles rounding remainder)
          qty = Math.round((receivedQty - allocated) * 1000) / 1000;
        } else {
          qty = Math.round((d.demand / totalDemand) * receivedQty * 1000) / 1000;
        }

        qty = Math.max(0, qty);
        allocated += qty;

        if (qty > 0) {
          await client.query(
            `INSERT INTO store_allocations
               (dc_id, sku_id, store_id, delivery_id, allocated_qty, allocation_type, mbq, soh, demand)
             VALUES ($1,$2,$3,$4,$5,'NFT',$6,$7,$8)`,
            [dcId, skuId, d.storeId, deliveryId, qty, d.mbq, d.soh, d.demand],
          );
        }

        results.push({ storeId: d.storeId, allocatedQty: qty, demand: d.demand });
      }

      await client.query('COMMIT');
      return results;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Compares WMS inventory_ledger Available qty vs SAP stock figures.
   * Flags discrepancies > 0.1% of total SKU quantity.
   * Publishes SAP_SYNC_DISCREPANCY alert to SQS.
   * Req 15.7, 15.8
   */
  async reconcileWithSAP(dcId: string): Promise<ReconciliationRow[]> {
    // Fetch SAP stock via internal SAP integration service
    let sapStock: SAPStockRecord[] = [];
    try {
      const response = await fetch(`${this.sapIntegrationUrl}/internal/sap/stock?dc_id=${dcId}`);
      if (response.ok) {
        sapStock = (await response.json()) as SAPStockRecord[];
      }
    } catch (err) {
      console.error('SAP stock fetch failed:', err);
    }

    const sapMap = new Map<string, number>(sapStock.map((r) => [r.sku_id, r.available_qty]));

    // Fetch WMS Available quantities
    const wmsResult = await this.db.query<{ sku_id: string; sku_code: string; quantity: string }>(
      `SELECT il.sku_id, s.sku_code, il.quantity
       FROM inventory_ledger il
       JOIN skus s ON s.sku_id = il.sku_id
       WHERE il.dc_id = $1 AND il.stock_state = 'Available'`,
      [dcId],
    );

    const rows: ReconciliationRow[] = [];

    for (const wmsRow of wmsResult.rows) {
      const wmsQty = parseFloat(wmsRow.quantity);
      const sapQty = sapMap.get(wmsRow.sku_id) ?? 0;
      const variance = Math.abs(wmsQty - sapQty);
      const total = Math.max(wmsQty, sapQty, 1);
      const variancePct = (variance / total) * 100;
      const flagged = variancePct > 0.1;

      const row: ReconciliationRow = {
        sku_id: wmsRow.sku_id,
        sku_code: wmsRow.sku_code,
        wms_available_qty: wmsQty,
        sap_available_qty: sapQty,
        variance,
        variance_pct: variancePct,
        flagged,
        checked_at: new Date().toISOString(),
      };

      rows.push(row);

      if (flagged && this.sqsClient && this.alertQueueUrl) {
        // Insert alert record
        const alertResult = await this.db.query<{ alert_id: string }>(
          `INSERT INTO alerts (dc_id, alert_type, severity, reference_doc, payload)
           VALUES ($1,'SAP_SYNC_DISCREPANCY','Warning',$2,$3)
           RETURNING alert_id`,
          [
            dcId,
            wmsRow.sku_id,
            JSON.stringify({ sku_id: wmsRow.sku_id, wms_qty: wmsQty, sap_qty: sapQty, variance_pct: variancePct }),
          ],
        );

        try {
          await this.sqsClient.send(
            new SendMessageCommand({
              QueueUrl: this.alertQueueUrl,
              MessageBody: JSON.stringify({
                alert_id: alertResult.rows[0]!.alert_id,
                alert_type: 'SAP_SYNC_DISCREPANCY',
                dc_id: dcId,
                sku_id: wmsRow.sku_id,
              }),
            }),
          );
        } catch (sqsErr) {
          console.error('Failed to publish SAP_SYNC_DISCREPANCY to SQS:', sqsErr);
        }
      }
    }

    return rows;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async adjustLedger(
    client: PoolClient,
    dcId: string,
    skuId: string,
    stockState: string,
    delta: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO inventory_ledger (dc_id, sku_id, stock_state, quantity)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (dc_id, sku_id, stock_state) DO NOTHING`,
      [dcId, skuId, stockState],
    );

    const result = await client.query<{ quantity: string }>(
      `UPDATE inventory_ledger
       SET quantity = quantity + $1, updated_at = now()
       WHERE dc_id = $2 AND sku_id = $3 AND stock_state = $4
       RETURNING quantity`,
      [delta, dcId, skuId, stockState],
    );

    const newQty = parseFloat(result.rows[0]!.quantity);
    if (newQty < 0) {
      throw Object.assign(
        new Error(`NEGATIVE_QUANTITY: ${stockState} for ${skuId} in ${dcId} would be ${newQty}`),
        { code: 'NEGATIVE_QUANTITY' },
      );
    }
  }

  /**
   * Asserts the ledger balance equation:
   * Available + Quarantined + Held + Rejected + InTransit == Total_Received - Total_Dispatched - Total_Disposed
   */
  private async assertBalanceEquation(
    client: PoolClient,
    dcId: string,
    skuId: string,
  ): Promise<void> {
    const ledgerResult = await client.query<{ stock_state: string; quantity: string }>(
      `SELECT stock_state, quantity FROM inventory_ledger WHERE dc_id=$1 AND sku_id=$2`,
      [dcId, skuId],
    );

    let lhs = 0;
    for (const row of ledgerResult.rows) {
      if (['Available', 'Quarantined', 'Held', 'Rejected', 'InTransit'].includes(row.stock_state)) {
        lhs += parseFloat(row.quantity);
      }
    }

    const txnResult = await client.query<{ total_received: string; total_dispatched: string; total_disposed: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN txn_type = 'Receipt' THEN quantity ELSE 0 END), 0) AS total_received,
         COALESCE(SUM(CASE WHEN txn_type = 'Dispatch' THEN quantity ELSE 0 END), 0) AS total_dispatched,
         COALESCE(SUM(CASE WHEN txn_type = 'Disposal' THEN quantity ELSE 0 END), 0) AS total_disposed
       FROM stock_transactions
       WHERE dc_id=$1 AND sku_id=$2`,
      [dcId, skuId],
    );

    if (txnResult.rows.length > 0) {
      const t = txnResult.rows[0]!;
      const rhs =
        parseFloat(t.total_received) -
        parseFloat(t.total_dispatched) -
        parseFloat(t.total_disposed);

      const tolerance = 0.001; // floating point tolerance
      if (Math.abs(lhs - rhs) > tolerance) {
        throw Object.assign(
          new Error(
            `LEDGER_BALANCE_VIOLATION: LHS=${lhs} RHS=${rhs} for SKU ${skuId} in DC ${dcId}`,
          ),
          { code: 'LEDGER_BALANCE_VIOLATION' },
        );
      }
    }
  }
}
