# SumoSave WMS — Complete Test Data Guide

> Copy-paste ready data for every screen and every user role.
> Follow the flow top to bottom for a complete end-to-end test.

---

## LOGINS

### Vendor Portal (Web — localhost:3001)
Click the role card on the login screen. No password needed.

| Role Card | What you can access |
|-----------|-------------------|
| **SCM Head** | Everything — Control Tower, all modules |
| **Inbound Supervisor** | Dock Queue, Receiving & QC, Exceptions |
| **Finance User** | Exception Queue, GST approvals |
| **QC Associate** | Receiving & QC scanning |
| **Vendor User** | New ASN, Appointments, Compliance |
| **Gate Staff** | Gate Entry, Dock Queue |

### Scanner App (localhost:8081)
Type the OTP in the "Shift Access OTP" field and tap START SHIFT.

| OTP | Role |
|-----|------|
| `123456` | QC Associate |
| `234567` | Gate Staff |
| `345678` | Inbound Supervisor |
| `111111` | QC Associate (quick test) |
| `222222` | Gate Staff (quick test) |

---

## STEP 1 — ADMIN SETUP
**Role: SCM Head → Admin Setup (sidebar)**

### Create Vendor

| Field | Value |
|-------|-------|
| Vendor Code | `VND-010` |
| DC / Warehouse | `DC-BLR-01` |
| Vendor / Company Name | `Nestle India Ltd` |
| GSTIN | `07AAACN0006C1Z6` |

### Create SKU

| Field | Value |
|-------|-------|
| SKU Code | `SKU-NOODLE-001` |
| DC / Warehouse | `DC-BLR-01` |
| Product Name | `Maggi Noodles 70g` |
| Category | `FMCG_Food` |
| Packaging Class | `SealedCarton` |
| GST Rate | `18` |
| MRP | `15` |
| Primary Barcode | `8901491502227` |
| Fast Track | ☐ No |
| Perishable | ☐ No |
| Cold Chain | ☐ No |

### Inject PO (Simulate SAP)

| Field | Value |
|-------|-------|
| PO Number | `PO-99001` |
| DC / Warehouse | `DC-BLR-01` |
| Vendor ID (UUID) | *(copy from Master Data → Vendors after creating VND-010)* |
| SKU ID (UUID) | *(copy from Master Data → SKU Catalogue after creating SKU-NOODLE-001)* |
| Ordered Qty | `500` |
| Unit Price | `12.00` |
| GST Rate | `18` |

---

## STEP 2 — CREATE ASN
**Role: Vendor User → New ASN (sidebar)**

### Test Case A — High Score ASN (PO-88291, Patanjali Foods)

| Field | Value |
|-------|-------|
| PO Number | `PO-88291` |
| *(click Load PO)* | |
| Vehicle Number | `KA-01-AB-1234` |
| Driver Name | `Ramesh Kumar` |
| Expected Arrival | *(pick a time 4+ hours from now)* |
| Handling Units | `24` |
| Invoice Reference | `INV-PF-2026-001` |
| **Line 1 — India Gate Basmati 5kg** | |
| Qty | `1200` |
| Batch No | `RICE-BT-2026-04` |
| Expiry Date | `2027-12-31` |
| **Line 2 — Patanjali Mustard Oil 1L** | |
| Qty | `840` |
| Batch No | `OIL-BT-2026-04` |
| Expiry Date | `2027-06-30` |

Expected confidence score: **85–95**

---

### Test Case B — Amul Dairy (Perishable — batch/expiry mandatory)

| Field | Value |
|-------|-------|
| PO Number | `PO-88292` |
| *(click Load PO)* | |
| Vehicle Number | `MH-12-CD-5678` |
| Driver Name | `Suresh Patil` |
| Expected Arrival | *(pick a time 2+ hours from now)* |
| Handling Units | `10` |
| Invoice Reference | `INV-AD-2026-042` |
| **Line 1 — Amul Full Cream Milk 1L** | |
| Qty | `500` |
| Batch No | `MILK-BT-2026-05` |
| Expiry Date | `2026-06-15` |

> ⚠ Milk is **Perishable** — batch and expiry are mandatory. The form will block submission without them.

Expected confidence score: **80–90**

---

### Test Case C — Low Score ASN (minimal data)

| Field | Value |
|-------|-------|
| PO Number | `PO-88293` |
| *(click Load PO)* | |
| Vehicle Number | *(leave blank)* |
| Driver Name | *(leave blank)* |
| All other fields | *(leave blank)* |

Expected confidence score: **40–50** (Paper-level quality)

---

## STEP 3 — GATE ENTRY
**Role: Gate Staff → Gate Entry (sidebar)**

### Test Case A — Normal Entry

| Field | Value |
|-------|-------|
| Vehicle Registration Number | `KA-01-AB-1234` |
| Vendor ID | `VND-001` |
| ASN Reference | *(leave blank — optional)* |
| *(click PROCEED TO VALIDATION)* | |
| Seal Status | `Intact` |
| *(click CONFIRM SEAL STATUS)* | |
| *(click CONFIRM GATE ENTRY)* | |

### Test Case B — Suspended Vendor (will be rejected)

| Field | Value |
|-------|-------|
| Vehicle Registration Number | `DL-05-EF-9999` |
| Vendor ID | *(use a vendor_id of a suspended vendor)* |

### Test Case C — Paper ASN (truck without digital ASN)
**Gate Staff → 📄 Paper ASN button (top right of Gate Entry)**

| Field | Value |
|-------|-------|
| PO Number | `PO-88294` |
| *(click Load PO)* | |
| Vehicle Registration | `TN-09-GH-3456` |
| Driver Name | `Vijay Sharma` |
| Arrival Date & Time | *(now)* |
| Handling Units | `8` |
| Invoice / Challan Number | `CH-HUL-2026-099` |
| Paper Doc Reference | `PAPER-DOC-001` |
| Entered By | `Gate Staff Name` |
| **Line 1 — Surf Excel 1kg** | |
| Qty on Paper | `960` |
| Batch No | `SOD-BT-2026-03` |
| Expiry Date | `2028-01-01` |
| Damage Noted | ☐ No |

Expected confidence score: **40–55** (Paper channel)

---

## STEP 4 — DOCK ASSIGNMENT
**Role: Inbound Supervisor → Dock Queue (sidebar)**

After gate entry, the truck appears in the **Yard Queue** at the bottom.

| Action | What to do |
|--------|-----------|
| Find truck | Look in Yard Queue table — vehicle `KA-01-AB-1234` |
| Assign dock | Click **Assign Dock** → select any available dock (D-01 to D-08) |

---

## STEP 5 — RECEIVING & QC
**Role: QC Associate → Receiving & QC (sidebar)**

### Select Delivery
Click on one of the active deliveries shown on the left panel.

### Scan Barcodes
Use these real barcodes from the seed data:

| Product | Barcode to scan |
|---------|----------------|
| India Gate Basmati 5kg | `8901234567890` |
| Patanjali Mustard Oil 1L | `8909876543210` |
| Amul Full Cream Milk 1L | `8904900000001` |
| Britannia Good Day 200g | `8901063011092` |
| Tata Tea Gold 500g | `8901030890888` |

In the scan field, type the barcode and press Enter (or use the camera scanner).

### Batch & Expiry Capture (for food items)

| Field | Value |
|-------|-------|
| Batch Number | `BT-2026-TEST-01` |
| Expiry Date | `2027-12-31` |

---

## STEP 6 — EXCEPTION HANDLING
**Role: Finance User → Exception Queue (sidebar)**

Exceptions are auto-created when:
- GST on invoice doesn't match PO GST rate
- Price variance > 0.5%
- Damaged items reported

### To trigger a GST mismatch exception:
Submit an ASN for `PO-88292` (Amul Milk — GST 0%) but during QC mark the invoice GST as 5%. The system will auto-block and create an exception.

### To resolve an exception:
1. Click the exception in the queue
2. Review the mismatch details
3. Click **Approve** or **Reject**

---

## STEP 7 — INVENTORY CHECK
**Role: SCM Head → Inventory Ledger (sidebar)**

After GRN is posted, stock appears here.

| Filter | Value |
|--------|-------|
| DC | `DC-BLR-01` |
| SKU | `SKU-RICE-001` or any seeded SKU |

---

## STEP 8 — VENDOR SCORECARD
**Role: SCM Head → Vendor Scorecard (sidebar)**

Click any vendor to see:
- Composite score (0–100)
- Tier: Gold / Silver / Bronze / Watch
- KPI breakdown: ASN Coverage, On-Time, First-Pass Yield, Doc Currency, Barcode Remediation

---

## STEP 9 — USER MANAGEMENT
**Role: SCM Head → User Management (sidebar)**

### Create a new user

| Field | Value |
|-------|-------|
| Full Name | `Rahul Sharma` |
| DC / Warehouse | `DC-BLR-01` |
| Email | `rahul@sumosave.com` |
| Phone | `+919876543210` |
| Language | `English` |
| Roles | Select: `QC_Associate` |

---

## REFERENCE DATA

### Vendors (pre-seeded)

| Code | Name | GSTIN |
|------|------|-------|
| VND-001 | Patanjali Foods Ltd | `27AABCT1234Z1Z1` |
| VND-002 | Amul Dairy Corp | `27AABCA5678Z1Z2` |
| VND-003 | ITC Limited | `27AABCI9012Z1Z3` |
| VND-004 | Britannia Industries | `27AABCB3456Z1Z4` |
| VND-005 | HUL India | `27AABCH7890Z1Z5` |

### Purchase Orders (pre-seeded)

| PO Number | Vendor | Items |
|-----------|--------|-------|
| `PO-88291` | Patanjali Foods (VND-001) | Rice 1200 units + Oil 840 units |
| `PO-88292` | Amul Dairy (VND-002) | Milk 500 units |
| `PO-88293` | Britannia (VND-004) | Biscuits 2400 units |
| `PO-88294` | HUL India (VND-005) | Surf Excel 960 units |

### SKUs (pre-seeded)

| SKU Code | Product | Barcode | GST | MRP |
|----------|---------|---------|-----|-----|
| SKU-RICE-001 | India Gate Basmati 5kg | `8901234567890` | 5% | ₹580 |
| SKU-OIL-012 | Patanjali Mustard Oil 1L | `8909876543210` | 12% | ₹180 |
| SKU-MILK-001 | Amul Full Cream Milk 1L | `8904900000001` | 0% | ₹68 |
| SKU-BIS-044 | Britannia Good Day 200g | `8901063011092` | 18% | ₹45 |
| SKU-TEA-019 | Tata Tea Gold 500g | `8901030890888` | 5% | ₹220 |
| SKU-SOD-008 | Surf Excel 1kg | *(no barcode seeded)* | 18% | ₹175 |

### Dock Numbers
`D-01` `D-02` `D-03` `D-04` `D-05` `D-06` `D-07` `D-08`

### DC ID
`DC-BLR-01`

---

## QUICK FLOW SUMMARY

```
SCM Head → Admin Setup → Create Vendor + SKU + Inject PO
    ↓
Vendor User → New ASN → Enter PO-88291 → Fill details → Submit
    ↓
Gate Staff → Gate Entry → Enter vehicle KA-01-AB-1234 + VND-001 → Confirm
    ↓
Inbound Supervisor → Dock Queue → Assign Dock D-01
    ↓
QC Associate → Receiving & QC → Select delivery → Scan barcode 8901234567890
    ↓
Finance User → Exception Queue → Review any exceptions → Approve/Reject
    ↓
SCM Head → Control Tower → See live status of all trucks
```
