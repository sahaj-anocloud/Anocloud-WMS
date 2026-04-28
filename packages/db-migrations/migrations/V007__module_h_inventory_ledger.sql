-- V007: Module H — Inventory Ledger and Stock States
-- Tables: inventory_ledger, stock_transactions, store_allocations

-- ─── Inventory Ledger ─────────────────────────────────────────────────────────

CREATE TABLE inventory_ledger (
  ledger_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id       VARCHAR(20) NOT NULL,
  sku_id      UUID NOT NULL REFERENCES skus(sku_id),
  stock_state VARCHAR(20) NOT NULL
    CHECK (stock_state IN ('Available','Quarantined','Held','Rejected','InTransit','Disposed')),
  quantity    NUMERIC(12,3) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dc_id, sku_id, stock_state)
);

CREATE INDEX idx_inventory_ledger_dc_id ON inventory_ledger (dc_id);
CREATE INDEX idx_inventory_ledger_sku_id ON inventory_ledger (sku_id);
CREATE INDEX idx_inventory_ledger_stock_state ON inventory_ledger (stock_state);

-- ─── Stock Transactions ───────────────────────────────────────────────────────

CREATE TABLE stock_transactions (
  txn_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id         VARCHAR(20) NOT NULL,
  sku_id        UUID NOT NULL REFERENCES skus(sku_id),
  txn_type      VARCHAR(30) NOT NULL,  -- Receipt | Quarantine | Release | Dispatch | Disposal
  from_state    VARCHAR(20),
  to_state      VARCHAR(20) NOT NULL,
  quantity      NUMERIC(12,3) NOT NULL,
  reference_doc VARCHAR(100),
  performed_by  UUID NOT NULL,
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_transactions_dc_id ON stock_transactions (dc_id);
CREATE INDEX idx_stock_transactions_sku_id ON stock_transactions (sku_id);
CREATE INDEX idx_stock_transactions_txn_type ON stock_transactions (txn_type);
CREATE INDEX idx_stock_transactions_performed_at ON stock_transactions (performed_at);
CREATE INDEX idx_stock_transactions_reference_doc ON stock_transactions (reference_doc);

-- ─── Store Allocations ────────────────────────────────────────────────────────

CREATE TABLE store_allocations (
  allocation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dc_id           VARCHAR(20) NOT NULL,
  sku_id          UUID NOT NULL REFERENCES skus(sku_id),
  store_id        VARCHAR(50) NOT NULL,
  delivery_id     UUID NOT NULL REFERENCES deliveries(delivery_id),
  allocated_qty   NUMERIC(12,3) NOT NULL,
  allocation_type VARCHAR(10) NOT NULL CHECK (allocation_type IN ('FT','NFT')),
  mbq             NUMERIC(12,3),
  soh             NUMERIC(12,3),
  demand          NUMERIC(12,3),  -- MBQ - SOH
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_store_allocations_dc_id ON store_allocations (dc_id);
CREATE INDEX idx_store_allocations_sku_id ON store_allocations (sku_id);
CREATE INDEX idx_store_allocations_store_id ON store_allocations (store_id);
CREATE INDEX idx_store_allocations_delivery_id ON store_allocations (delivery_id);
