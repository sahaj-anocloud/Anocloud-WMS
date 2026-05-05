# SumoSave WMS — Complete Testing Workflow

> **Version:** 1.0 | **Apps:** Vendor Portal (Next.js) + Scanner App (React Native/Expo)
> **DC:** DC-BLR-01 (Bangalore) | **Environment:** Development (localhost)

---

## 🗺️ Quick-Reference Summary

| App | URL | Auth Method |
|-----|-----|-------------|
| Vendor Portal | `http://localhost:3001` | Click role card → email auto-fills → password `password123` |
| Scanner App | `http://localhost:8081` (Expo) | 6-digit OTP → tap START SHIFT |
| WMS API | `http://localhost:3000` | JWT (handled automatically) |

### 🔑 Login Credentials at a Glance

**Vendor Portal — Role Cards**

| Role Card | Email (auto-filled) | Password | Default Landing Page |
|-----------|--------------------|-----------|--------------------|
| SCM Head | `scm_head@sumosave.in` | `password123` | `/dashboard` |
| Inbound Supervisor | `supervisor@sumosave.in` | `password123` | `/dock-queue` |
| Finance User | `finance@sumosave.in` | `password123` | `/exceptions` |
| QC Associate | `qc@sumosave.in` | `password123` | `/receiving` |
| Vendor User | `vendor@sumosave.in` | `password123` | `/shipments/new` |
| Gate Staff | `gate@sumosave.in` | `password123` | `/gate-entry` |

**Scanner App — OTP Codes**

| OTP | Role |
|-----|------|
| `123456` | QC Associate |
| `234567` | Gate Staff |
| `345678` | Inbound Supervisor |

### 📦 Pre-Seeded Test Data

**Vendors**

| Code | Name | GSTIN |
|------|------|-------|
| VND-001 | Patanjali Foods Ltd | `27AABCT1234Z1Z1` |
| VND-002 | Amul Dairy Corp | `27AABCA5678Z1Z2` |
| VND-003 | ITC Limited | `27AABCI9012Z1Z3` |
| VND-004 | Britannia Industries | `27AABCB3456Z1Z4` |
| VND-005 | HUL India | `27AABCH7890Z1Z5` |

**Purchase Orders**

| PO Number | Vendor | Items |
|-----------|--------|-------|
| `PO-88291` | Patanjali Foods (VND-001) | India Gate Basmati 5kg (1200 units) + Mustard Oil 1L (840 units) |
| `PO-88292` | Amul Dairy (VND-002) | Amul Full Cream Milk 1L (500 units) — Perishable |
| `PO-88293` | Britannia (VND-004) | Britannia Good Day 200g (2400 units) |
| `PO-88294` | HUL India (VND-005) | Surf Excel 1kg (960 units) |

**SKUs & Barcodes**

| SKU Code | Product | Barcode | GST | MRP |
|----------|---------|---------|-----|-----|
| SKU-RICE-001 | India Gate Basmati 5kg | `8901234567890` | 5% | ₹580 |
| SKU-OIL-012 | Patanjali Mustard Oil 1L | `8909876543210` | 12% | ₹180 |
| SKU-MILK-001 | Amul Full Cream Milk 1L | `8904900000001` | 0% | ₹68 |
| SKU-BIS-044 | Britannia Good Day 200g | `8901063011092` | 18% | ₹45 |
| SKU-TEA-019 | Tata Tea Gold 500g | `8901030890888` | 5% | ₹220 |

**Docks:** D-01 through D-08 | **DC:** DC-BLR-01

---

## 👁️ Sidebar Role Visibility Matrix

| Page | SCM Head | Supervisor | Finance | QC | Vendor | Gate |
|------|:--------:|:----------:|:-------:|:--:|:------:|:----:|
| Control Tower `/dashboard` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Dock Queue `/dock-queue` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Gate Entry `/gate-entry` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Receiving & QC `/receiving` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Discrepancy `/discrepancy` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Exception Queue `/exceptions` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Alert Center `/alerts` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Inventory Ledger `/inventory` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Vendor Scorecard `/vendor-scorecard` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Scan Policy `/scan-policy` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Master Data `/master-data` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Admin Setup `/admin-setup` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| User Management `/user-management` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| New ASN `/shipments/new` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Paper ASN `/shipments/paper` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Appointments `/appointments` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Compliance `/compliance` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 🌐 VENDOR PORTAL — Page-by-Page Testing Guide

---

### 🔐 LOGIN PAGE — `/`

**Role:** Any (role selection happens here)
**What it shows:** Two-panel layout. Left panel has SumoSave branding and stats. Right panel has 6 role cards in a 2-column grid.

#### Step-by-Step Test Actions

**Test A — Normal Login (SCM Head)**

1. Open `http://localhost:3001` in browser
2. Verify left panel shows: "SUMOSAVE WMS PLATFORM", stats (22 API Modules, 12 Business Rules, <1s Scan Latency)
3. Verify right panel shows 6 role cards: SCM Head (green), Inbound Supervisor (blue), Finance User (amber), QC Associate (purple), Vendor User (green), Gate Staff (slate)
4. Click the **SCM Head** card
5. ✅ Expected: Page transitions to auth step. A green role badge appears showing "SCM Head — Full system access, GKM hard-stop approvals"
6. Verify email field auto-fills with `scm_head@sumosave.in`
7. Enter password: `password123`
8. Click **SECURE LOGIN →**
9. ✅ Expected: Redirects to `/dashboard`. Sidebar shows all sections. Top-right shows "Welcome back, SCM Head!" notification.

**Test B — Vendor User Login**

1. Click **Vendor User** card
2. Email auto-fills: `vendor@sumosave.in`
3. Enter password: `password123`
4. Click **SECURE LOGIN →**
5. ✅ Expected: Redirects to `/shipments/new`. Sidebar shows only: Vendor Scorecard, New ASN, Appointments, Compliance.

**Test C — Gate Staff Login**

1. Click **Gate Staff** card
2. Email auto-fills: `gate@sumosave.in`
3. Enter password: `password123`
4. Click **SECURE LOGIN →**
5. ✅ Expected: Redirects to `/gate-entry`. Sidebar shows: Dock Queue, Gate Entry, Paper ASN, Appointments.

**Test D — Back Navigation**

1. Click any role card (e.g. Finance User)
2. Click **← Back to role selection** link
3. ✅ Expected: Returns to 6-card grid view.

**Test E — Wrong Password**

1. Click **SCM Head** card
2. Enter password: `wrongpassword`
3. Click **SECURE LOGIN →**
4. ✅ Expected: Red error banner appears below password field. No redirect.

---

### 🏗️ ADMIN SETUP — `/admin-setup`

**Role:** SCM Head only
**What it shows:** Forms to create Vendors, SKUs, and inject POs (simulate SAP feed). This is the prerequisite for all other workflows.

#### Step-by-Step Test Actions

**Test A — Create a New Vendor**

1. Login as **SCM Head** → navigate to **Admin Setup** in sidebar
2. Find the "Create Vendor" section
3. Fill in:

| Field | Value |
|-------|-------|
| Vendor Code | `VND-010` |
| DC / Warehouse | `DC-BLR-01` |
| Vendor / Company Name | `Nestle India Ltd` |
| GSTIN | `07AAACN0006C1Z6` |

4. Click **Create Vendor**
5. ✅ Expected: Success notification. VND-010 appears in vendor list.

**Test B — Create a New SKU**

1. Find the "Create SKU" section
2. Fill in:

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

3. Click **Create SKU**
4. ✅ Expected: Success notification. SKU-NOODLE-001 appears in SKU list.

**Test C — Inject PO (Simulate SAP)**

1. Find the "Inject PO" section
2. Fill in:

| Field | Value |
|-------|-------|
| PO Number | `PO-99001` |
| DC / Warehouse | `DC-BLR-01` |
| Vendor ID | *(UUID from Master Data → Vendors for VND-010)* |
| SKU ID | *(UUID from Master Data → SKU Catalogue for SKU-NOODLE-001)* |
| Ordered Qty | `500` |
| Unit Price | `12.00` |
| GST Rate | `18` |

3. Click **Inject PO**
4. ✅ Expected: PO-99001 created. Vendor User can now reference it in a New ASN.

---

### 👤 USER MANAGEMENT — `/user-management`

**Role:** SCM Head only
**What it shows:** List of system users with roles. Form to create new users.

#### Step-by-Step Test Actions

**Test A — Create New User**

1. Login as **SCM Head** → navigate to **User Management**
2. Fill in:

| Field | Value |
|-------|-------|
| Full Name | `Rahul Sharma` |
| DC / Warehouse | `DC-BLR-01` |
| Email | `rahul@sumosave.com` |
| Phone | `+919876543210` |
| Language | `English` |
| Roles | `QC_Associate` |

3. Click **Create User**
4. ✅ Expected: Rahul Sharma appears in user list with QC Associate role.

---

### 🗄️ MASTER DATA — `/master-data`

**Role:** SCM Head only
**What it shows:** Read-only catalogue of Vendors and SKUs. Used to look up UUIDs for PO injection.

#### Step-by-Step Test Actions

1. Login as **SCM Head** → navigate to **Master Data**
2. ✅ Expected: Two tabs/sections — Vendors and SKU Catalogue
3. Find VND-001 (Patanjali Foods Ltd) — note the UUID for use in PO injection
4. Find SKU-RICE-001 (India Gate Basmati 5kg) — note the UUID
5. ✅ Expected: All 5 pre-seeded vendors visible. All 5+ pre-seeded SKUs visible.

---

### 📊 CONTROL TOWER — `/dashboard`

**Role:** SCM Head, Finance User
**What it shows:** Live KPI dashboard — trucks in yard, docks active, GRNs posted today, exception count, dwell time alerts.

#### Step-by-Step Test Actions

1. Login as **SCM Head** → navigate to **Control Tower**
2. ✅ Expected: KPI cards visible at top (trucks in yard, active docks, GRNs today, open exceptions)
3. ✅ Expected: Live status indicator in top bar shows "All Systems Operational"
4. ✅ Expected: SAP Synced indicator in sidebar footer
5. Login as **Finance User** → verify Control Tower is accessible
6. Login as **Vendor User** → verify Control Tower is NOT in sidebar (no access)

---

### 🚪 DOCK QUEUE — `/dock-queue`

**Role:** SCM Head, Inbound Supervisor, Gate Staff
**What it shows:** Active dock assignments + Yard Queue (trucks waiting for dock assignment).

#### Step-by-Step Test Actions

**Test A — View Dock Status**

1. Login as **Inbound Supervisor** → navigate to **Dock Queue**
2. ✅ Expected: Grid showing D-01 through D-08 dock status (Available/Occupied)
3. ✅ Expected: Yard Queue table at bottom showing trucks that have completed gate entry but not yet assigned a dock

**Test B — Assign Dock to Truck**

*(Requires a truck to have completed Gate Entry first — see Gate Entry section)*

1. Find vehicle `KA-01-AB-1234` in the Yard Queue
2. Click **Assign Dock**
3. Select dock `D-01` from available docks
4. ✅ Expected: D-01 changes to Occupied. Truck moves from Yard Queue to active dock list.

---

### 🏁 GATE ENTRY — `/gate-entry`

**Role:** SCM Head, Inbound Supervisor, Gate Staff
**What it shows:** Form to register vehicle arrival. Validates vendor status, checks for existing ASN.

#### Step-by-Step Test Actions

**Test A — Normal Gate Entry (with ASN)**

1. Login as **Gate Staff** → navigate to **Gate Entry**
2. Fill in:

| Field | Value |
|-------|-------|
| Vehicle Registration Number | `KA-01-AB-1234` |
| Vendor ID | `VND-001` |
| ASN Reference | *(leave blank — optional)* |

3. Click **PROCEED TO VALIDATION**
4. ✅ Expected: Validation panel appears showing vendor status (Active), ASN match (if any)
5. Set Seal Status: `Intact`
6. Click **CONFIRM SEAL STATUS**
7. Click **CONFIRM GATE ENTRY**
8. ✅ Expected: Gate entry recorded. Vehicle appears in Dock Queue → Yard Queue.

**Test B — Suspended Vendor (Rejection)**

1. Fill in a vendor ID that is suspended
2. Click **PROCEED TO VALIDATION**
3. ✅ Expected: Red error banner — vendor is suspended, entry blocked.

**Test C — Verify Paper ASN Button**

1. On Gate Entry page, look for **📄 Paper ASN** button (top right)
2. ✅ Expected: Button visible for Gate Staff role
3. Click it → redirects to `/shipments/paper`

---

### 📦 NEW ASN — `/shipments/new`

**Role:** SCM Head, Vendor User
**What it shows:** Multi-step form to create an Advance Shipment Notice against a PO.

#### Step-by-Step Test Actions

**Test A — High-Score ASN (Patanjali, PO-88291)**

1. Login as **Vendor User** → navigate to **New ASN**
2. Enter PO Number: `PO-88291`
3. Click **Load PO**
4. ✅ Expected: PO details load — Vendor: Patanjali Foods, 2 line items appear
5. Fill in header:

| Field | Value |
|-------|-------|
| Vehicle Number | `KA-01-AB-1234` |
| Driver Name | `Ramesh Kumar` |
| Expected Arrival | *(pick a time 4+ hours from now)* |
| Handling Units | `24` |
| Invoice Reference | `INV-PF-2026-001` |

6. Fill Line 1 (India Gate Basmati 5kg):

| Field | Value |
|-------|-------|
| Qty | `1200` |
| Batch No | `RICE-BT-2026-04` |
| Expiry Date | `2027-12-31` |

7. Fill Line 2 (Patanjali Mustard Oil 1L):

| Field | Value |
|-------|-------|
| Qty | `840` |
| Batch No | `OIL-BT-2026-04` |
| Expiry Date | `2027-06-30` |

8. Click **Submit ASN**
9. ✅ Expected: ASN created with confidence score **85–95**. Status: Submitted.

**Test B — Perishable ASN (Amul, PO-88292)**

1. Enter PO Number: `PO-88292` → click **Load PO**
2. Fill header:

| Field | Value |
|-------|-------|
| Vehicle Number | `MH-12-CD-5678` |
| Driver Name | `Suresh Patil` |
| Expected Arrival | *(2+ hours from now)* |
| Handling Units | `10` |
| Invoice Reference | `INV-AD-2026-042` |

3. Fill Line 1 (Amul Full Cream Milk 1L):

| Field | Value |
|-------|-------|
| Qty | `500` |
| Batch No | `MILK-BT-2026-05` |
| Expiry Date | `2026-06-15` |

4. ⚠️ Note: Milk is **Perishable** — batch and expiry are mandatory. Attempting to submit without them should be blocked.
5. Click **Submit ASN**
6. ✅ Expected: ASN created with confidence score **80–90**.

**Test C — Low-Score ASN (Minimal Data)**

1. Enter PO Number: `PO-88293` → click **Load PO**
2. Leave Vehicle Number, Driver Name, and all optional fields blank
3. Click **Submit ASN**
4. ✅ Expected: ASN created with confidence score **40–50** (paper-level quality). Warning shown.

---

### 📄 PAPER ASN — `/shipments/paper`

**Role:** SCM Head, Inbound Supervisor, Gate Staff
**What it shows:** Simplified ASN form for walk-in trucks that arrive without a digital ASN.

#### Step-by-Step Test Actions

**Test A — Walk-in Truck (HUL, PO-88294)**

1. Login as **Gate Staff** → navigate to **Paper ASN** (sidebar or via Gate Entry button)
2. Fill in:

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

3. Fill Line 1 (Surf Excel 1kg):

| Field | Value |
|-------|-------|
| Qty on Paper | `960` |
| Batch No | `SOD-BT-2026-03` |
| Expiry Date | `2028-01-01` |
| Damage Noted | ☐ No |

4. Click **Submit Paper ASN**
5. ✅ Expected: Paper ASN created with confidence score **40–55** (paper channel). Vehicle enters Yard Queue.

---

### 📅 APPOINTMENTS — `/appointments`

**Role:** SCM Head, Inbound Supervisor, Vendor User, Gate Staff
**What it shows:** 7-day calendar grid (5 docks × 5 time slots per day). 2-hour slots from 08:00–18:00. Heavy truck restriction 12:00–16:00.

#### Step-by-Step Test Actions

**Test A — Book a Standard Truck Slot**

1. Login as **Vendor User** → navigate to **Appointments**
2. ✅ Expected: Calendar grid shows 7 days × 5 docks. Legend shows Available (green), Booked (red), Past (grey), Heavy Truck Window (amber)
3. In the **Step 1** dropdown, select an ASN from your submitted ASNs (e.g. the one created in New ASN Test A)
4. ✅ Expected: "ASN selected ✓" confirmation appears
5. Click any green (available) slot in the morning (08:00 or 10:00) for dock D-01
6. ✅ Expected: Booking modal opens showing dock, time, date
7. Verify ASN Reference is pre-filled from dropdown
8. Select Vehicle Type: **Standard (20ft)**
9. Click **Confirm Booking**
10. ✅ Expected: Success card shows assigned dock, time, appointment ID. "Download Slip" button available.

**Test B — Heavy Truck Restriction**

1. Click a slot in the 08:00–10:00 window
2. In the booking modal, select Vehicle Type: **Heavy Duty (40ft)**
3. ✅ Expected: Red warning appears — "Heavy trucks cannot be booked in this time slot". Confirm button disabled.
4. Close modal. Click a slot in the **12:00–14:00** window (amber/heavy truck window)
5. Select Vehicle Type: **Heavy Duty (40ft)**
6. ✅ Expected: No restriction warning. Confirm button enabled.

**Test C — Week Navigation**

1. Click **→** arrow to advance to next week
2. ✅ Expected: Calendar updates to show next 7 days. Current week button disabled when at week 0.
3. Click **←** to go back
4. ✅ Expected: Returns to current week. Past slots show as greyed out.

**Test D — Download Appointment Slip**

1. After booking (Test A), click **Download Slip**
2. ✅ Expected: New browser tab opens with printable HTML slip showing dock number, time, date, appointment ID, and "arrive 15 minutes early" notice.

---

### 📋 COMPLIANCE — `/compliance`

**Role:** SCM Head, Vendor User
**What it shows:** Vendor compliance documents, certifications, and regulatory requirements.

#### Step-by-Step Test Actions

1. Login as **Vendor User** → navigate to **Compliance**
2. ✅ Expected: Page loads showing compliance document list or upload interface
3. Login as **Gate Staff** → verify Compliance is NOT in sidebar

---

### 📥 RECEIVING & QC — `/receiving`

**Role:** SCM Head, Inbound Supervisor, QC Associate
**What it shows:** Left panel with active deliveries. Right panel with scan interface, batch capture, and QC pass/fail controls.

#### Step-by-Step Test Actions

**Test A — Select Delivery and Scan**

1. Login as **QC Associate** → navigate to **Receiving & QC**
2. ✅ Expected: Left panel shows active deliveries (trucks that have been dock-assigned)
3. Click on a delivery (e.g. the one for KA-01-AB-1234 / PO-88291)
4. ✅ Expected: Right panel activates with scan input field
5. In the scan field, type barcode: `8901234567890` and press Enter
6. ✅ Expected: Green match indicator. Scan count increments. Item identified as "India Gate Basmati 5kg"
7. Scan barcode: `8909876543210`
8. ✅ Expected: Match for "Patanjali Mustard Oil 1L"

**Test B — Batch & Expiry Capture**

1. After scanning, look for batch capture fields
2. Fill in:

| Field | Value |
|-------|-------|
| Batch Number | `BT-2026-TEST-01` |
| Expiry Date | `2027-12-31` |

3. Click **Save Batch**
4. ✅ Expected: Batch data recorded against the scan line.

**Test C — Mismatch Scan**

1. In the scan field, type a barcode NOT in the PO: `8901030890888` (Tata Tea Gold)
2. ✅ Expected: Red mismatch alert. Scan rejected. Option to quarantine or flag as exception.

**Test D — Post GRN**

1. After all lines are scanned and QC passed
2. Click **Post GRN**
3. ✅ Expected: GRN number generated. Stock appears in Inventory Ledger. Vendor scorecard updates.

---

### ⚠️ DISCREPANCY — `/discrepancy`

**Role:** SCM Head, Inbound Supervisor, Finance User
**What it shows:** List of quantity/price discrepancies between ASN and actual received goods.

#### Step-by-Step Test Actions

1. Login as **Inbound Supervisor** → navigate to **Discrepancy**
2. ✅ Expected: Table of discrepancy records with columns: PO, Vendor, SKU, Expected Qty, Received Qty, Variance
3. Click on a discrepancy record
4. ✅ Expected: Detail view with options to Accept Variance or Raise Exception
5. Login as **QC Associate** → verify Discrepancy is NOT in sidebar

---

### 🚨 EXCEPTION QUEUE — `/exceptions`

**Role:** SCM Head, Inbound Supervisor, Finance User
**What it shows:** Auto-generated exceptions for GST mismatches, price variances >0.5%, damaged items.

#### Step-by-Step Test Actions

**Test A — View Exceptions**

1. Login as **Finance User** → navigate to **Exception Queue**
2. ✅ Expected: List of open exceptions with type, severity, vendor, PO reference

**Test B — Trigger GST Mismatch Exception**

1. Submit an ASN for PO-88292 (Amul Milk — GST 0%)
2. During QC, mark invoice GST as 5%
3. ✅ Expected: System auto-creates a GST mismatch exception. Delivery is blocked.

**Test C — Resolve Exception**

1. Click on the GST mismatch exception
2. Review mismatch details (expected 0%, received 5%)
3. Click **Approve** (Finance User has authority)
4. ✅ Expected: Exception resolved. Delivery unblocked. Audit trail updated.

---

### 🔔 ALERT CENTER — `/alerts`

**Role:** SCM Head, Inbound Supervisor, Finance User
**What it shows:** System alerts — dwell time warnings, expiry alerts, quarantine notifications, escalations.

#### Step-by-Step Test Actions

1. Login as **SCM Head** → navigate to **Alert Center**
2. ✅ Expected: Alert list with severity badges (Critical/Warning/Info)
3. ✅ Expected: Bell icon in top bar shows red dot when unread alerts exist
4. Click an alert to view details
5. ✅ Expected: Alert detail with timestamp, affected entity, recommended action

---

### 📦 INVENTORY LEDGER — `/inventory`

**Role:** SCM Head, Inbound Supervisor, Finance User
**What it shows:** Real-time stock levels by SKU and DC. Updated after GRN posting.

#### Step-by-Step Test Actions

1. Login as **SCM Head** → navigate to **Inventory Ledger**
2. Filter by DC: `DC-BLR-01`
3. ✅ Expected: Stock table showing SKU, product name, quantity on hand, last updated
4. After posting a GRN (from Receiving & QC), refresh the page
5. ✅ Expected: Received quantities reflected in stock levels

---

### ⭐ VENDOR SCORECARD — `/vendor-scorecard`

**Role:** SCM Head, Inbound Supervisor, Finance User, Vendor User
**What it shows:** Composite vendor performance scores (0–100) with tier classification and KPI breakdown.

#### Step-by-Step Test Actions

1. Login as **SCM Head** → navigate to **Vendor Scorecard**
2. ✅ Expected: List of all vendors with composite scores and tier badges (Gold/Silver/Bronze/Watch)
3. Click on **VND-001 (Patanjali Foods)**
4. ✅ Expected: Detail view showing:
   - Composite Score (0–100)
   - Tier: Gold / Silver / Bronze / Watch
   - KPI breakdown: ASN Coverage, On-Time Delivery, First-Pass Yield, Doc Currency, Barcode Remediation
5. Login as **Vendor User** → navigate to Vendor Scorecard
6. ✅ Expected: Vendor User sees only their own scorecard (filtered to their vendor)

---

### 🛡️ SCAN POLICY — `/scan-policy`

**Role:** SCM Head, Inbound Supervisor
**What it shows:** Packaging class scan rules (read-only table) + editable low-confidence ASN settings.

#### Step-by-Step Test Actions

**Test A — View Packaging Class Rules**

1. Login as **SCM Head** → navigate to **Scan Policy**
2. ✅ Expected: Table with 6 packaging classes and their rules:

| Packaging Class | Base Formula | Physical Count | Label Affixing | Integrity Preserve |
|----------------|-------------|:--------------:|:--------------:|:-----------------:|
| Sealed Carton | `MAX(1, CEIL(batch_size * 0.05))` | No | No | No |
| Gunny Bag | `1` | Yes | No | No |
| Rice | `1` | No | Yes | No |
| Shrink Wrap | `batch_size` | No | No | Yes |
| Loose | `batch_size + 1` | No | No | No |
| Mixed Load | `MAX(1, CEIL(batch_size * 0.05))` | No | No | No |

**Test B — Update Low-Confidence Settings**

1. Change **Low Confidence Threshold** from `60` to `70`
2. Change **Low Confidence Multiplier** from `1.5` to `2.0`
3. Leave **Reason Code** blank → click **Save Policy**
4. ✅ Expected: Error — "A reason code is required before saving."
5. Enter Reason Code: `Q4 policy review`
6. Click **Save Policy**
7. ✅ Expected: Green success banner — "Scan policy saved successfully."

**Test C — Invalid Multiplier Range**

1. Set Low Confidence Multiplier to `6.0` (outside 0.5–5.0 range)
2. Enter Reason Code: `test`
3. Click **Save Policy**
4. ✅ Expected: Error — "INVALID_MODIFIER_RANGE — The modifier value is outside the allowed range [0.5, 5.0]."

---

## 📱 SCANNER APP — Screen-by-Screen Testing Guide

> **Launch:** Run `npx expo start` in `apps/scanner-app/`, then open on device/emulator or press `w` for web.
> **API Base URL:** Configured in `apps/scanner-app/.env` — defaults to `http://localhost:3000`

---

### 🔐 LOGIN SCREEN

**Header:** "SumoSave" + "WMS Scanner" (in primary green)
**What it shows:** Single OTP input field (large, centered, letter-spaced), START SHIFT button, version footer.

#### Step-by-Step Test Actions

**Test A — QC Associate Login**

1. Launch Scanner App
2. ✅ Expected: Login screen with "Shift Access OTP" label, 6-digit input, "START SHIFT" button
3. ✅ Expected: Footer shows "Version 1.0.0 (BETA)" and "Device ID: SCAN-992-X"
4. Tap the OTP input field
5. Enter: `123456`
6. Tap **START SHIFT**
7. ✅ Expected: Loading spinner appears. Navigates to Gate Entry Screen.

**Test B — Gate Staff Login**

1. Enter OTP: `234567`
2. Tap **START SHIFT**
3. ✅ Expected: Navigates to Gate Entry Screen with Gate Staff role.

**Test C — Supervisor Login**

1. Enter OTP: `345678`
2. Tap **START SHIFT**
3. ✅ Expected: Navigates to Gate Entry Screen with Supervisor role.

**Test D — Invalid OTP (5 digits)**

1. Enter: `12345` (only 5 digits)
2. Tap **START SHIFT**
3. ✅ Expected: Error message — "Please enter a 6-digit OTP". No navigation.

**Test E — Wrong OTP**

1. Enter: `999999`
2. Tap **START SHIFT**
3. ✅ Expected: Error message from API — "Login failed. Please try again."

---

### 🚪 GATE ENTRY SCREEN

**Header:** "VEHICLE ARRIVAL" (navigation bar title)
**What it shows:** Form with Vehicle Number, Vendor Code, PO/ASN Reference fields. REGISTER ARRIVAL button.

#### Step-by-Step Test Actions

**Test A — Register Vehicle Arrival**

1. After login, Gate Entry Screen appears automatically
2. ✅ Expected: Three input fields visible: Vehicle Number, Vendor Code, PO / ASN Reference
3. Tap **Vehicle Number** field
4. Enter: `KA-01-AB-1234`
5. Tap **Vendor Code** field
6. Enter: `VND-001`
7. Tap **PO / ASN Reference** field
8. Enter: `PO-88291`
9. Tap **REGISTER ARRIVAL**
10. ✅ Expected: Navigates to Delivery List Screen. Vehicle registered in system.

**Test B — Minimal Entry (no PO reference)**

1. Enter Vehicle Number: `MH-12-CD-5678`
2. Enter Vendor Code: `VND-002`
3. Leave PO / ASN Reference blank
4. Tap **REGISTER ARRIVAL**
5. ✅ Expected: Navigates to Delivery List Screen. Entry recorded without ASN link.

---

### 📋 DELIVERY LIST SCREEN

**Header:** "INBOUND DELIVERIES" (navigation bar title)
**What it shows:** List of active inbound deliveries assigned to this scanner/dock. Each row shows vendor, PO, status.

#### Step-by-Step Test Actions

1. After Gate Entry, Delivery List Screen appears
2. ✅ Expected: List of deliveries with vendor name, PO number, status badge
3. Tap on a delivery row (e.g. PO-88291 / Patanjali Foods)
4. ✅ Expected: Navigates to Scan Screen for that delivery line

---

### 📷 SCAN SCREEN

**Header:** "SCANNING" (navigation bar title)
**What it shows:** Barcode scan input (camera or manual entry), scan counter, match/mismatch feedback.

#### Step-by-Step Test Actions

**Test A — Successful Barcode Scan**

1. From Delivery List, tap a delivery
2. ✅ Expected: Scan Screen with barcode input field and scan counter (e.g. "Scanned: 0 / 5")
3. Type or scan barcode: `8901234567890`
4. ✅ Expected: Green "✓ MATCH" banner appears. Counter increments to 1.
5. Scan again: `8901234567890`
6. ✅ Expected: Counter increments to 2.

**Test B — Mismatch Scan**

1. Scan a barcode not in the delivery: `8901030890888` (Tata Tea Gold)
2. ✅ Expected: Full-screen red error overlay appears with "⚠ SCAN ERROR" title
3. ✅ Expected: Message — "Barcode mismatch. This item does not match the expected SKU."
4. ✅ Expected: Screen shakes (shake animation)
5. Tap **TAP TO CONTINUE**
6. ✅ Expected: Error overlay dismisses. Scan input re-enabled.

**Test C — Unexpected Barcode**

1. Scan a completely unknown barcode: `0000000000000`
2. ✅ Expected: Full-screen error — "Unexpected barcode. This item was not expected in this delivery."
3. Tap **TAP TO CONTINUE** to dismiss

**Test D — Complete All Required Scans**

1. Scan the required number of barcodes (shown in counter denominator)
2. ✅ Expected: When count reaches required_scans, automatically advances to Batch Capture Screen (for GunnyBag/Loose) or Confirmation Screen (for SealedCarton/ShrinkWrap)

---

### 📦 BATCH CAPTURE SCREEN

**Header:** "BATCH DATA" (navigation bar title)
**What it shows:** Product name header, Batch Number input, Expiry Date input (YYYY-MM-DD format), SAVE BATCH DATA button.

#### Step-by-Step Test Actions

**Test A — Capture Batch Data**

1. Arrives here after completing scans (or navigated from Delivery List for batch items)
2. ✅ Expected: Product name shown in header (e.g. "Premium Basmati Rice 5kg")
3. Tap **Batch Number** field
4. Enter: `RICE-BT-2026-04`
5. Tap **Expiry Date** field
6. Enter: `2027-12-31`
7. Tap **SAVE BATCH DATA**
8. ✅ Expected: Batch data saved. Navigates back to previous screen.

**Test B — Perishable Item (Amul Milk)**

1. For a perishable delivery, batch and expiry are mandatory
2. Leave Expiry Date blank → tap **SAVE BATCH DATA**
3. ✅ Expected: Validation error or blocked submission (expiry required for perishables)

---

### 🔴 QUARANTINE SCREEN

**Header:** "QUARANTINE" (navigation bar title)
**What it shows:** Header "Quarantine Stock — Select reason for isolation". List of 6 reason options. CONFIRM QUARANTINE button.

#### Quarantine Reasons Available
- Damaged Packaging
- Leaking Product
- Incorrect Batch
- Near Expiry
- Mismatch with PO
- Quality Concern

#### Step-by-Step Test Actions

**Test A — Quarantine Damaged Item**

1. Navigate to Quarantine Screen (from Scan Screen mismatch or Delivery List option)
2. ✅ Expected: 6 reason rows displayed, none selected. CONFIRM QUARANTINE button is greyed out.
3. Tap **Damaged Packaging**
4. ✅ Expected: Row highlights with green border. Checkmark circle appears on right. Button becomes active.
5. Tap **CONFIRM QUARANTINE**
6. ✅ Expected: Quarantine event queued (offline-safe). Navigates back. Event will sync when online.

**Test B — Near Expiry Quarantine**

1. Tap **Near Expiry**
2. ✅ Expected: Row highlights. Previous selection deselects (single-select).
3. Tap **CONFIRM QUARANTINE**
4. ✅ Expected: Quarantine event queued with reason "Near Expiry".

**Test C — No Selection (Button State)**

1. Do not tap any reason
2. ✅ Expected: CONFIRM QUARANTINE button remains greyed out (disabled state).

---

### 🏷️ LPN PRINT SCREEN

**Header:** "PRINT LABEL" (navigation bar title)
**What it shows:** Label preview (white card with LPN ID, barcode placeholder, SKU name, batch/expiry), printer target info, CONFIRM & PRINT button.

#### Step-by-Step Test Actions

**Test A — Print LPN Label**

1. Navigate to LPN Print Screen (from Delivery List or after QC pass)
2. ✅ Expected: Label preview shows:
   - "SUMOSAVE LPN" title
   - LPN ID: `LPN-99281-X`
   - Black barcode placeholder bar
   - SKU name: "Premium Basmati Rice 5kg"
   - Batch: `B-101` | Exp: `2027-12`
3. ✅ Expected: Header shows "Target: Zebra ZT411 (Dock 4)"
4. Tap **CONFIRM & PRINT**
5. ✅ Expected: Button shows "PRINTING..." briefly. Print job queued to Zebra ZT411 at `10.0.0.99`. Navigates back.

**Test B — Offline Print Queue**

1. Disable network connection on device
2. Tap **CONFIRM & PRINT**
3. ✅ Expected: Print job queued in offline sync queue (PRINT_LPN transaction). Will send when connectivity restored.

---

### 🔬 QC WIZARD SCREEN

**Header:** "QC Scan Wizard" (navigation bar title)
**What it shows:** 4-step wizard — instructions → scanning → count_entry → confirmation. Adapts per packaging class.

#### QC Wizard Steps
1. **instructions** — Shows packaging class, required scan count, special instructions
2. **scanning** — Barcode scan interface with progress counter
3. **count_entry** — Physical count input (for GunnyBag and Loose only)
4. **confirmation** — Summary card with SUBMIT QC PASS button

#### Step-by-Step Test Actions

**Test A — SealedCarton Flow**

1. Navigate to QC Wizard for a SealedCarton delivery line
2. **Step 1 — Instructions:**
   - ✅ Expected: Packaging class label shows "SealedCarton"
   - ✅ Expected: Instruction text explains scan sampling (e.g. "Scan 5% of cartons, minimum 1")
   - ✅ Expected: Required scans count shown (e.g. 3 for a batch of 60)
   - Tap **START SCANNING**
3. **Step 2 — Scanning:**
   - ✅ Expected: Progress shows "Scanned: 0 / 3"
   - Scan barcode: `8901234567890` three times
   - ✅ Expected: Each scan shows "✓ MATCH" banner. Counter increments.
   - After 3rd scan, auto-advances to Step 4 (no count entry for SealedCarton)
4. **Step 4 — Confirmation:**
   - ✅ Expected: Summary card shows Packaging Class: SealedCarton, Scans Completed: 3/3
   - Tap **SUBMIT QC PASS**
   - ✅ Expected: Alert "QC Pass — QC inspection passed successfully." Navigates back.

**Test B — GunnyBag Flow (with Physical Count)**

1. Navigate to QC Wizard for a GunnyBag delivery line
2. **Step 1 — Instructions:**
   - ✅ Expected: Packaging class label shows "GunnyBag"
   - ✅ Expected: Required scans: 1
   - Tap **START SCANNING**
3. **Step 2 — Scanning:**
   - Scan 1 barcode
   - ✅ Expected: Auto-advances to Step 3 (count entry)
4. **Step 3 — Count Entry:**
   - ✅ Expected: Label shows "Bag Count" (not "Unit Count")
   - Enter count: `48`
   - Tap **CONFIRM COUNT**
   - ✅ Expected: Advances to Step 4
5. **Step 4 — Confirmation:**
   - ✅ Expected: Summary shows Packaging Class: GunnyBag, Scans: 1/1, Bag Count: 48
   - Tap **SUBMIT QC PASS**

**Test C — ShrinkWrap Flow (Integrity Preserve)**

1. Navigate to QC Wizard for a ShrinkWrap delivery line
2. **Step 1 — Instructions:**
   - ✅ Expected: Packaging class label shows "ShrinkWrap"
   - ✅ Expected: Warning indicator ⚠ displayed (integrity preserve flag)
   - ✅ Expected: Required scans = batch_size (scan every item)
   - Tap **START SCANNING**
3. Scan all items in the batch
4. ✅ Expected: Auto-advances to Step 4 (no count entry for ShrinkWrap)
5. Tap **SUBMIT QC PASS**

**Test D — Loose Flow (with Unit Count)**

1. Navigate to QC Wizard for a Loose delivery line
2. **Step 1 — Instructions:**
   - ✅ Expected: Required scans = batch_size + 1
   - Tap **START SCANNING**
3. Complete all scans
4. **Step 3 — Count Entry:**
   - ✅ Expected: Label shows "Unit Count" (not "Bag Count")
   - Enter count: `120`
   - Tap **CONFIRM COUNT**
5. **Step 4 — Confirmation:**
   - ✅ Expected: Summary shows Unit Count: 120
   - Tap **SUBMIT QC PASS**

**Test E — Cold Chain Banner**

1. Navigate to QC Wizard for a cold chain item (e.g. Amul Milk)
2. ✅ Expected: Amber banner at top — "⚠ COLD CHAIN — Route to ColdZone immediately after scanning."
3. Banner persists across all 4 steps

**Test F — Supervisor Review Banner (Mixed Load)**

1. Navigate to QC Wizard for a MixedLoad delivery
2. **Step 1 — Instructions:**
   - ✅ Expected: Blue/accent banner — "🔔 Supervisor review required for this mixed load."

**Test G — Scan Error Acknowledgement**

1. In Step 2 (scanning), scan a mismatched barcode
2. ✅ Expected: Full-screen red error overlay with shake animation
3. ✅ Expected: Scanning is blocked until error is acknowledged
4. Tap **TAP TO CONTINUE**
5. ✅ Expected: Overlay dismisses. Scan input re-enabled. Mismatch NOT counted toward progress.

---

## 🔄 END-TO-END WORKFLOW GUIDES

---

### Workflow 1 — Full Gate-to-GRN (Primary Flow)

**Estimated time:** 20–30 minutes | **Roles needed:** SCM Head, Vendor User, Gate Staff, Inbound Supervisor, QC Associate

```
Step 1: Admin Setup (SCM Head)
  → Create Vendor VND-010 (Nestle India Ltd)
  → Create SKU SKU-NOODLE-001 (Maggi Noodles 70g)
  → Inject PO PO-99001 (500 units @ ₹12)

Step 2: Create ASN (Vendor User)
  → New ASN → Load PO-88291
  → Fill vehicle KA-01-AB-1234, driver Ramesh Kumar
  → Add line items with batch/expiry
  → Submit → Confidence score 85-95

Step 3: Book Appointment (Vendor User)
  → Appointments → Select ASN from dropdown
  → Click available slot (e.g. D-01, tomorrow 10:00)
  → Select Standard truck → Confirm Booking
  → Download appointment slip

Step 4: Gate Entry (Gate Staff — Web Portal)
  → Gate Entry → Enter KA-01-AB-1234 + VND-001
  → Proceed to Validation → Seal: Intact
  → Confirm Gate Entry
  → Vehicle appears in Yard Queue

Step 5: Dock Assignment (Inbound Supervisor)
  → Dock Queue → Find KA-01-AB-1234 in Yard Queue
  → Click Assign Dock → Select D-01
  → Truck moves to Active Docks

Step 6: Receiving & QC (QC Associate — Web Portal)
  → Receiving & QC → Select delivery for KA-01-AB-1234
  → Scan barcode 8901234567890 (India Gate Basmati)
  → Scan barcode 8909876543210 (Mustard Oil)
  → Enter batch BT-2026-TEST-01, expiry 2027-12-31
  → Post GRN

Step 7: Verify Results (SCM Head)
  → Inventory Ledger → Filter DC-BLR-01 → Stock updated
  → Vendor Scorecard → VND-001 score updated
  → Control Tower → GRN count incremented
```

---

### Workflow 2 — QC Wizard (Scanner App, All 4 Packaging Classes)

**Estimated time:** 15 minutes | **Role:** QC Associate (OTP: 123456)

```
Login → OTP 123456 → START SHIFT
  ↓
Gate Entry Screen → Enter vehicle + vendor → REGISTER ARRIVAL
  ↓
Delivery List → Tap delivery row
  ↓
[For SealedCarton delivery]
  Scan Screen → Scan 8901234567890 (required_scans times)
  → Auto-advance to QC Wizard
  → Step 1: Instructions (SealedCarton, no warnings)
  → Step 2: Scanning (scan 5% sample)
  → Step 4: Confirmation → SUBMIT QC PASS ✅

[For GunnyBag delivery]
  → Step 1: Instructions (GunnyBag, physical count required)
  → Step 2: Scanning (scan 1 item)
  → Step 3: Count Entry → Enter "Bag Count": 48
  → Step 4: Confirmation → SUBMIT QC PASS ✅

[For ShrinkWrap delivery]
  → Step 1: Instructions (⚠ warning shown, scan every item)
  → Step 2: Scanning (scan all items)
  → Step 4: Confirmation → SUBMIT QC PASS ✅

[For Loose delivery]
  → Step 1: Instructions (scan batch_size + 1)
  → Step 2: Scanning
  → Step 3: Count Entry → Enter "Unit Count": 120
  → Step 4: Confirmation → SUBMIT QC PASS ✅
```

---

### Workflow 3 — Exception Handling Flow

**Estimated time:** 10 minutes | **Roles:** Vendor User, Finance User

```
Step 1: Create ASN with GST mismatch (Vendor User)
  → New ASN → Load PO-88292 (Amul Milk, GST 0%)
  → Submit ASN normally

Step 2: During QC, mark invoice GST as 5% (QC Associate)
  → Receiving & QC → Select Amul delivery
  → In invoice details, enter GST: 5%
  → System auto-creates GST mismatch exception
  → Delivery is BLOCKED

Step 3: Review Exception (Finance User)
  → Exception Queue → Find GST mismatch exception
  → Click to open → Review: Expected 0%, Received 5%
  → Options: Approve / Reject

Step 4a: Approve Exception
  → Click Approve
  → Delivery unblocked → GRN can proceed
  → Audit trail records Finance User approval

Step 4b: Reject Exception
  → Click Reject → Enter rejection reason
  → Delivery remains blocked
  → Vendor notified (Alert Center)
```

---

### Workflow 4 — Vendor Scorecard Viewing

**Estimated time:** 5 minutes | **Roles:** SCM Head, Vendor User

```
SCM Head view (all vendors):
  → Vendor Scorecard → See all 5 vendors listed
  → Click VND-001 (Patanjali Foods)
  → View: Composite Score, Tier (Gold/Silver/Bronze/Watch)
  → KPI breakdown:
    - ASN Coverage: % of POs with ASN submitted
    - On-Time Delivery: % arriving within appointment window
    - First-Pass Yield: % passing QC without exceptions
    - Doc Currency: % with valid compliance docs
    - Barcode Remediation: % of barcodes correctly scanned

Vendor User view (own scorecard only):
  → Login as Vendor User → Vendor Scorecard
  → Only sees their own vendor's data
  → Cannot see other vendors' scores
```

---

### Workflow 5 — Scan Policy Configuration

**Estimated time:** 5 minutes | **Role:** SCM Head

```
→ Admin Setup → Scan Policy
→ View packaging class table (read-only):
  SealedCarton: MAX(1, CEIL(batch_size * 0.05))
  GunnyBag: 1 (physical count required)
  Rice: 1 (label affixing required)
  ShrinkWrap: batch_size (integrity preserve)
  Loose: batch_size + 1
  MixedLoad: MAX(1, CEIL(batch_size * 0.05))

→ Edit Low-Confidence Settings:
  Threshold: 60 → 70
  Multiplier: 1.5 → 2.0
  Reason Code: "Q4 policy review"
  → Save Policy → Success ✅

→ Test invalid multiplier:
  Multiplier: 6.0 → Save → INVALID_MODIFIER_RANGE error ✅
```

---

### Workflow 6 — Appointment Booking (Calendar Grid)

**Estimated time:** 5 minutes | **Role:** Vendor User

```
Prerequisites: Have a Submitted ASN (from Workflow 1 Step 2)

→ Appointments page
→ Step 1: Select ASN from dropdown
→ Calendar grid shows 7 days × 5 docks × 5 slots/day
→ Slot times: 08:00, 10:00, 12:00, 14:00, 16:00 (2-hour slots)
→ Heavy truck window: 12:00–16:00 (amber color)

Book standard truck (morning slot):
  → Click green slot at D-02, tomorrow 10:00
  → Modal: ASN pre-filled, select Standard (20ft)
  → Confirm Booking → Success card shows dock + time

Book heavy truck (restricted window):
  → Click amber slot at D-03, tomorrow 12:00
  → Modal: Select Heavy Duty (40ft)
  → No restriction warning → Confirm Booking ✅

Attempt heavy truck in wrong window:
  → Click green slot at D-01, tomorrow 08:00
  → Modal: Select Heavy Duty (40ft)
  → Warning: "Heavy trucks cannot be booked in this time slot"
  → Confirm button disabled ✅
```

---

### Workflow 7 — Paper ASN Flow (Walk-in Truck)

**Estimated time:** 5 minutes | **Role:** Gate Staff

```
Scenario: Truck arrives at gate without digital ASN

→ Gate Entry page → Click "📄 Paper ASN" button (top right)
  OR
→ Sidebar → Paper ASN

→ Fill form:
  PO Number: PO-88294 → Load PO
  Vehicle: TN-09-GH-3456
  Driver: Vijay Sharma
  Arrival: now
  Handling Units: 8
  Invoice/Challan: CH-HUL-2026-099
  Paper Doc Ref: PAPER-DOC-001

→ Line 1 (Surf Excel 1kg):
  Qty: 960
  Batch: SOD-BT-2026-03
  Expiry: 2028-01-01
  Damage: No

→ Submit Paper ASN
→ Confidence score: 40–55 (paper channel penalty)
→ Vehicle enters Yard Queue for dock assignment
→ Inbound Supervisor assigns dock → QC proceeds normally
```

---

### Workflow 8 — Quarantine Flow (Scanner App)

**Estimated time:** 5 minutes | **Role:** QC Associate (OTP: 123456)

```
Scenario: Damaged item found during scanning

→ Login → OTP 123456
→ Gate Entry → Register vehicle
→ Delivery List → Select delivery
→ Scan Screen → Scan damaged item barcode
→ Mismatch or damage detected → Navigate to Quarantine Screen

→ Quarantine Screen:
  → Select reason: "Damaged Packaging"
  → CONFIRM QUARANTINE button activates
  → Tap CONFIRM QUARANTINE
  → Event queued: QUARANTINE_PLACE transaction
  → Navigates back to Delivery List

→ Verify in Web Portal (Inbound Supervisor):
  → Alert Center → Quarantine alert appears
  → Exception Queue → Quarantine exception created
```

---

### Workflow 9 — LPN Print Flow (Scanner App)

**Estimated time:** 3 minutes | **Role:** QC Associate (OTP: 123456)

```
Scenario: After QC pass, print LPN label for received goods

→ Login → OTP 123456
→ Complete scanning for a delivery line
→ Navigate to LPN Print Screen

→ LPN Print Screen:
  → Preview shows: SUMOSAVE LPN, LPN-99281-X, barcode bar
  → SKU: Premium Basmati Rice 5kg
  → Batch: B-101 | Exp: 2027-12
  → Target printer: Zebra ZT411 (Dock 4) at 10.0.0.99

→ Tap CONFIRM & PRINT
→ Print job queued: PRINT_LPN transaction
→ Zebra ZT411 receives job and prints label
→ Navigates back

Offline scenario:
→ No network → Tap CONFIRM & PRINT
→ Job queued in offline sync queue
→ When network restored, sync service sends to printer
```

---

---

*Document generated for SumoSave WMS Phase 1 — DC-BLR-01 (Bangalore)*

*Covers: Vendor Portal (Next.js, localhost:3001) + Scanner App (React Native/Expo, localhost:8081)*

*API: localhost:3000 | Test Data: Pre-seeded VND-001 through VND-005, PO-88291 through PO-88294*


## Navigation Flow Maps

### Vendor Portal Navigation Flow

```text
/ (Login Page)
├── Click SCM Head      → /dashboard
├── Click Supervisor    → /dock-queue
├── Click Finance       → /exceptions
├── Click QC Associate  → /receiving
├── Click Vendor User   → /shipments/new
└── Click Gate Staff    → /gate-entry
```

### Scanner App Navigation Flow

`
LoginScreen → OTP (123456/234567/345678) → START SHIFT
    |
GateEntryScreen (VEHICLE ARRIVAL) → REGISTER ARRIVAL
    |
DeliveryListScreen (INBOUND DELIVERIES) → tap delivery row
    |
ScanScreen (SCANNING)
    Mismatch/Unexpected → Error Overlay → TAP TO CONTINUE → back to ScanScreen
    All scans done (SealedCarton/ShrinkWrap) → QCWizard: confirmation step
    All scans done (GunnyBag/Loose) → QCWizard: count_entry step
    → BatchCaptureScreen (BATCH DATA) → SAVE BATCH DATA → back
    → QuarantineScreen (QUARANTINE) → CONFIRM QUARANTINE → back
    → LPNPrintScreen (PRINT LABEL) → CONFIRM & PRINT → back

QCWizardScreen (QC Scan Wizard):
    instructions → START SCANNING → scanning
    scanning → (all done) → count_entry (GunnyBag/Loose) OR confirmation (others)
    count_entry → CONFIRM COUNT → confirmation
    confirmation → SUBMIT QC PASS → Alert OK → back
`

### Full System Data Flow

`
SAP ERP → PO Feed
    |
Admin Setup (SCM Head): Create Vendor + SKU + Inject PO
    |
Vendor User → New ASN: Load PO → Fill details → Submit (Score 40-95)
    |
Vendor User → Appointments: Select ASN → Pick slot → Book dock
    (Heavy truck: 12:00-16:00 only)
    |
Gate Staff → Gate Entry: Register vehicle → Validate → Confirm seal
    OR Paper ASN for walk-in trucks
    |
Truck enters Yard Queue
    |
Inbound Supervisor → Dock Queue: Assign dock D-01 to D-08
    |
QC Associate → Receiving & QC: Scan barcodes → Batch capture → QC pass/fail
    Exception → Exception Queue → Finance User Approve/Reject
    Discrepancy → Discrepancy page → Supervisor Accept/Raise
    |
Post GRN:
    Inventory Ledger updated
    Vendor Scorecard updated
    SAP stock sync (background job)
    Control Tower KPIs updated

Scanner App (parallel to web QC):
    Login (OTP) → Gate Entry → Delivery List → Scan
    → Batch Capture / Quarantine / LPN Print / QC Wizard
    → Offline sync queue → API when connectivity restored
`

---

## Troubleshooting Quick Reference

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Login fails | API not running | Start apps/wms-api with npm run dev |
| Sidebar shows no items | Role not set in session | Log out and log in again |
| Scanner OTP rejected | API not seeded | Check seed data in wms-api |
| Appointments calendar empty | No schedule data | Book an appointment first |
| Scan returns Policy Error | Line ID invalid | Ensure delivery is properly dock-assigned |
| QC Wizard stuck on loading | API policy endpoint failing | Check API logs |
| LPN print no response | Zebra printer offline | Check printer at 10.0.0.99 |
| Offline sync not sending | Sync service not running | Check sync.service.ts queue |
| Confidence score too low | Missing vehicle/driver/batch data | Fill all optional fields in ASN |
| Exception not auto-created | GST rates match | Intentionally mismatch GST in QC step |

---

## Test Checklist

### Vendor Portal

- [ ] Login page — all 6 role cards work
- [ ] Login page — back navigation works
- [ ] Login page — wrong password shows error
- [ ] Admin Setup — create vendor
- [ ] Admin Setup — create SKU
- [ ] Admin Setup — inject PO
- [ ] User Management — create user
- [ ] Master Data — view vendors and SKUs
- [ ] Control Tower — KPI cards visible (SCM Head, Finance)
- [ ] Dock Queue — view dock status
- [ ] Dock Queue — assign dock to truck
- [ ] Gate Entry — normal entry with ASN
- [ ] Gate Entry — suspended vendor rejection
- [ ] Gate Entry — Paper ASN button visible
- [ ] New ASN — high-score submission (PO-88291)
- [ ] New ASN — perishable validation (PO-88292)
- [ ] New ASN — low-score submission (PO-88293)
- [ ] Paper ASN — walk-in truck (PO-88294)
- [ ] Appointments — book standard truck slot
- [ ] Appointments — heavy truck restriction enforced
- [ ] Appointments — week navigation
- [ ] Appointments — download slip
- [ ] Compliance — page loads for Vendor User
- [ ] Receiving & QC — scan matching barcode
- [ ] Receiving & QC — scan mismatched barcode
- [ ] Receiving & QC — batch capture
- [ ] Receiving & QC — post GRN
- [ ] Discrepancy — view discrepancy list
- [ ] Exception Queue — view exceptions
- [ ] Exception Queue — approve exception
- [ ] Alert Center — view alerts
- [ ] Inventory Ledger — stock visible after GRN
- [ ] Vendor Scorecard — all vendors (SCM Head)
- [ ] Vendor Scorecard — own vendor only (Vendor User)
- [ ] Scan Policy — view packaging class table
- [ ] Scan Policy — save with reason code
- [ ] Scan Policy — invalid multiplier rejected
- [ ] Sidebar — role visibility correct for each role

### Scanner App

- [ ] Login — QC OTP 123456 works
- [ ] Login — Gate Staff OTP 234567 works
- [ ] Login — Supervisor OTP 345678 works
- [ ] Login — 5-digit OTP rejected
- [ ] Login — wrong OTP shows error
- [ ] Gate Entry — register vehicle arrival
- [ ] Delivery List — deliveries visible
- [ ] Scan Screen — matching barcode accepted
- [ ] Scan Screen — mismatch shows error overlay
- [ ] Scan Screen — error overlay dismisses on tap
- [ ] Scan Screen — unexpected barcode shows error
- [ ] Batch Capture — save batch number and expiry
- [ ] Quarantine — all 6 reasons selectable
- [ ] Quarantine — single-select behavior
- [ ] Quarantine — button disabled with no selection
- [ ] Quarantine — confirm queues offline event
- [ ] LPN Print — label preview renders
- [ ] LPN Print — confirm and print queues event
- [ ] QC Wizard — SealedCarton 4-step flow
- [ ] QC Wizard — GunnyBag with bag count
- [ ] QC Wizard — ShrinkWrap with integrity warning
- [ ] QC Wizard — Loose with unit count
- [ ] QC Wizard — cold chain banner visible
- [ ] QC Wizard — supervisor review banner (MixedLoad)
- [ ] QC Wizard — scan error blocks further scanning

---

Document generated for SumoSave WMS Phase 1 — DC-BLR-01 (Bangalore)
Vendor Portal: Next.js at localhost:3001 | Scanner App: React Native/Expo at localhost:8081
