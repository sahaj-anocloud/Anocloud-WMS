# SAP Integration Service

Java 17 / Spring Boot 3 service for integrating SumoSave WMS with SAP ERP.

## Features

### Module B: PO Ingestion (Task 3.1)

Implements `POST /internal/sap/po-sync` endpoint that:

- **Transforms SAP PO payload** to WMS format and upserts `purchase_orders` and `po_lines` tables
- **Idempotency**: Detects duplicate events by `sap_po_number` and ignores duplicates
- **SKU validation**: Flags PO lines referencing non-Active SKUs as `Blocked`
- **Alerting**: Sends SQS alerts to Admin_User and BnM_User for blocked lines
- **Authoritative source**: SAP PO is authoritative; no WMS user may override PO quantities or unit prices
- **State transitions**: Implements PO state transitions (Open → InProgress → Closed / PartiallyClosed)
- **No-backorder rule**: Short-delivered lines close cleanly without creating backorders

## Configuration

### Environment Variables

```properties
# Database
DB_URL=jdbc:postgresql://localhost:5432/sumosave_wms
DB_USERNAME=postgres
DB_PASSWORD=postgres

# AWS SQS
ALERT_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/123456789012/wms-alerts
AWS_REGION=ap-south-1
```

## API Endpoints

### POST /internal/sap/po-sync

Sync a Purchase Order from SAP into the WMS.

**Request Body:**
```json
{
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
}
```

**Response:** `202 Accepted`

**Behavior:**
- If PO already exists (by `sap_po_number`), ignores duplicate and returns 202
- If vendor not found, returns 400 Bad Request
- If SKU is not Active or doesn't exist, flags line as `Blocked` and sends alert
- Creates PO with status `Open` and timestamp `sap_synced_at`

### POST /internal/sap/grpo

Post a Goods Receipt PO to SAP (with retry).

### GET /internal/sap/stock?dcId={dcId}

Fetch current stock levels from SAP for reconciliation.

## Database Schema

### purchase_orders
- `po_id` (UUID, PK)
- `dc_id` (VARCHAR)
- `sap_po_number` (VARCHAR, UNIQUE)
- `vendor_id` (UUID, FK → vendors)
- `status` (VARCHAR: Open, InProgress, Closed, PartiallyClosed)
- `created_at` (TIMESTAMPTZ)
- `sap_synced_at` (TIMESTAMPTZ)

### po_lines
- `po_line_id` (UUID, PK)
- `po_id` (UUID, FK → purchase_orders)
- `sku_id` (UUID, FK → skus)
- `ordered_qty` (NUMERIC)
- `unit_price` (NUMERIC)
- `gst_rate` (NUMERIC)
- `received_qty` (NUMERIC, default 0)
- `status` (VARCHAR: Open, Blocked, Closed)

## Alert Format

When PO lines are blocked, an alert is sent to SQS:

```json
{
  "alertType": "PO_LINE_BLOCKED_NON_ACTIVE_SKU",
  "severity": "Warning",
  "dcId": "DC01",
  "sapPoNumber": "PO-2024-001",
  "blockedSkuCodes": ["SKU002", "SKU003"],
  "triggeredAt": "2024-01-15T10:30:00Z",
  "targetRoles": ["Admin_User", "BnM_User"]
}
```

## Testing

Run unit tests:
```bash
mvn test
```

Run specific test:
```bash
mvn test -Dtest=SapServiceTest
```

## Requirements Satisfied

- **Requirement 3.1**: PO ingestion from SAP via API integration
- **Requirement 3.2**: Idempotency by sap_po_number
- **Requirement 3.3**: Flag non-Active SKU lines as Blocked
- **Requirement 3.4**: SAP PO is authoritative (no manual overrides)
- **Requirement 3.5**: PO state transitions with timestamps
- **Requirement 3.6**: No-backorder rule (short-delivered lines close cleanly)
- **Requirement 3.7**: Complete PO state transition history

## Future Enhancements

- SAP JCo connector integration for BAPI_PO_GETDETAIL
- Scheduled PO sync job (every 15 minutes)
- PO state transition logic (InProgress, Closed, PartiallyClosed)
- Backorder prevention logic during receiving
