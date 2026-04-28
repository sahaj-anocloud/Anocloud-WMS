# Testing Guide for SAP Integration Service

## Prerequisites

1. PostgreSQL database running with WMS schema (migrations V001 and V002 applied)
2. Test data: At least one vendor and one SKU in the database
3. AWS SQS queue configured (or mock SQS for local testing)

## Setup Test Data

```sql
-- Insert test vendor
INSERT INTO vendors (vendor_id, dc_id, vendor_code, name, gstin, compliance_status, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'DC01',
  'V001',
  'Test Vendor Ltd',
  '29ABCDE1234F1Z5',
  'Active',
  now(),
  now()
);

-- Insert active SKU
INSERT INTO skus (sku_id, dc_id, sku_code, name, category, packaging_class, is_ft, is_perishable, requires_cold, gst_rate, mrp, status)
VALUES (
  gen_random_uuid(),
  'DC01',
  'SKU001',
  'Test Product 1',
  'FMCG_Food',
  'SealedCarton',
  false,
  false,
  false,
  18.00,
  100.00,
  'Active'
);

-- Insert inactive SKU (for testing blocked lines)
INSERT INTO skus (sku_id, dc_id, sku_code, name, category, packaging_class, is_ft, is_perishable, requires_cold, gst_rate, mrp, status)
VALUES (
  gen_random_uuid(),
  'DC01',
  'SKU002',
  'Test Product 2',
  'BDF',
  'GunnyBag',
  false,
  false,
  false,
  12.00,
  50.00,
  'Inactive'
);
```

## Test Cases

### Test Case 1: Successful PO Sync with Active SKU

**Request:**
```bash
curl -X POST http://localhost:8081/internal/sap/po-sync \
  -H "Content-Type: application/json" \
  -d '{
    "sapPoNumber": "PO-2024-001",
    "dcId": "DC01",
    "vendorCode": "V001",
    "lines": [
      {
        "skuCode": "SKU001",
        "orderedQty": 100.0,
        "unitPrice": 50.0,
        "gstRate": 18.0
      }
    ]
  }'
```

**Expected Result:**
- HTTP 202 Accepted
- PO created in database with status "Open"
- PO line created with status "Open"
- No alert sent to SQS

**Verification:**
```sql
SELECT po.sap_po_number, po.status, po.sap_synced_at,
       pl.ordered_qty, pl.unit_price, pl.gst_rate, pl.status as line_status
FROM purchase_orders po
JOIN po_lines pl ON po.po_id = pl.po_id
WHERE po.sap_po_number = 'PO-2024-001';
```

### Test Case 2: Idempotency - Duplicate PO Sync

**Request:**
```bash
# Run the same request from Test Case 1 again
curl -X POST http://localhost:8081/internal/sap/po-sync \
  -H "Content-Type: application/json" \
  -d '{
    "sapPoNumber": "PO-2024-001",
    "dcId": "DC01",
    "vendorCode": "V001",
    "lines": [
      {
        "skuCode": "SKU001",
        "orderedQty": 100.0,
        "unitPrice": 50.0,
        "gstRate": 18.0
      }
    ]
  }'
```

**Expected Result:**
- HTTP 202 Accepted
- No new PO created (duplicate ignored)
- Log message: "PO PO-2024-001 already exists. Ignoring duplicate sync request."

**Verification:**
```sql
-- Should still show only 1 PO
SELECT COUNT(*) FROM purchase_orders WHERE sap_po_number = 'PO-2024-001';
-- Expected: 1
```

### Test Case 3: PO Line Blocked for Inactive SKU

**Request:**
```bash
curl -X POST http://localhost:8081/internal/sap/po-sync \
  -H "Content-Type: application/json" \
  -d '{
    "sapPoNumber": "PO-2024-002",
    "dcId": "DC01",
    "vendorCode": "V001",
    "lines": [
      {
        "skuCode": "SKU002",
        "orderedQty": 50.0,
        "unitPrice": 30.0,
        "gstRate": 12.0
      }
    ]
  }'
```

**Expected Result:**
- HTTP 202 Accepted
- PO created with status "Open"
- PO line created with status "Blocked"
- Alert sent to SQS with blocked SKU codes

**Verification:**
```sql
SELECT po.sap_po_number, pl.status, s.sku_code, s.status as sku_status
FROM purchase_orders po
JOIN po_lines pl ON po.po_id = pl.po_id
JOIN skus s ON pl.sku_id = s.sku_id
WHERE po.sap_po_number = 'PO-2024-002';
-- Expected: line status = 'Blocked', sku_status = 'Inactive'
```

### Test Case 4: PO Line Blocked for Non-Existent SKU

**Request:**
```bash
curl -X POST http://localhost:8081/internal/sap/po-sync \
  -H "Content-Type: application/json" \
  -d '{
    "sapPoNumber": "PO-2024-003",
    "dcId": "DC01",
    "vendorCode": "V001",
    "lines": [
      {
        "skuCode": "SKU999",
        "orderedQty": 25.0,
        "unitPrice": 40.0,
        "gstRate": 5.0
      }
    ]
  }'
```

**Expected Result:**
- HTTP 202 Accepted
- PO created with status "Open"
- PO line created with status "Blocked" and NULL sku_id
- Alert sent to SQS with blocked SKU codes

**Verification:**
```sql
SELECT po.sap_po_number, pl.status, pl.sku_id
FROM purchase_orders po
JOIN po_lines pl ON po.po_id = pl.po_id
WHERE po.sap_po_number = 'PO-2024-003';
-- Expected: line status = 'Blocked', sku_id = NULL
```

### Test Case 5: Mixed Active and Blocked Lines

**Request:**
```bash
curl -X POST http://localhost:8081/internal/sap/po-sync \
  -H "Content-Type: application/json" \
  -d '{
    "sapPoNumber": "PO-2024-004",
    "dcId": "DC01",
    "vendorCode": "V001",
    "lines": [
      {
        "skuCode": "SKU001",
        "orderedQty": 100.0,
        "unitPrice": 50.0,
        "gstRate": 18.0
      },
      {
        "skuCode": "SKU002",
        "orderedQty": 50.0,
        "unitPrice": 30.0,
        "gstRate": 12.0
      }
    ]
  }'
```

**Expected Result:**
- HTTP 202 Accepted
- PO created with 2 lines
- First line status "Open" (SKU001 is Active)
- Second line status "Blocked" (SKU002 is Inactive)
- Alert sent to SQS with only SKU002 in blocked list

**Verification:**
```sql
SELECT po.sap_po_number, pl.status, s.sku_code, s.status as sku_status
FROM purchase_orders po
JOIN po_lines pl ON po.po_id = pl.po_id
LEFT JOIN skus s ON pl.sku_id = s.sku_id
WHERE po.sap_po_number = 'PO-2024-004'
ORDER BY s.sku_code;
-- Expected: 2 rows, one Open, one Blocked
```

### Test Case 6: Vendor Not Found

**Request:**
```bash
curl -X POST http://localhost:8081/internal/sap/po-sync \
  -H "Content-Type: application/json" \
  -d '{
    "sapPoNumber": "PO-2024-005",
    "dcId": "DC01",
    "vendorCode": "V999",
    "lines": []
  }'
```

**Expected Result:**
- HTTP 500 Internal Server Error
- Error message: "Vendor not found: V999"
- No PO created

## Unit Tests

Run all unit tests:
```bash
mvn test
```

Run specific test class:
```bash
mvn test -Dtest=SapServiceTest
mvn test -Dtest=SapControllerTest
```

## SQS Alert Verification

Check SQS queue for alert messages:
```bash
aws sqs receive-message \
  --queue-url https://sqs.ap-south-1.amazonaws.com/123456789012/wms-alerts \
  --max-number-of-messages 10
```

Expected alert format:
```json
{
  "alertType": "PO_LINE_BLOCKED_NON_ACTIVE_SKU",
  "severity": "Warning",
  "dcId": "DC01",
  "sapPoNumber": "PO-2024-002",
  "blockedSkuCodes": ["SKU002"],
  "triggeredAt": "2024-01-15T10:30:00Z",
  "targetRoles": ["Admin_User", "BnM_User"]
}
```

## Performance Testing

Test PO sync with large number of lines:
```bash
# Generate PO with 100 lines
curl -X POST http://localhost:8081/internal/sap/po-sync \
  -H "Content-Type: application/json" \
  -d @large-po-request.json
```

Expected: Complete within 5 seconds (per Requirement 3.2)

## Cleanup

```sql
-- Clean up test data
DELETE FROM po_lines WHERE po_id IN (
  SELECT po_id FROM purchase_orders WHERE sap_po_number LIKE 'PO-2024-%'
);
DELETE FROM purchase_orders WHERE sap_po_number LIKE 'PO-2024-%';
```
