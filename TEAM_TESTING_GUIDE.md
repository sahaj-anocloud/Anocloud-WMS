# SumoSave WMS: Team Testing & User Story Guide

This document provides the operational context, access instructions, and test data required to validate the Phase 1 deployment of the SumoSave Warehouse Management System (WMS).

---

## 1. System Access Points

To test the system, use the following URLs. Ensure you are on the company VPN if accessing from a remote location.

| Application | Access URL | Primary User Roles |
| :--- | :--- | :--- |
| **Vendor Portal** | `http://localhost:3001` | Vendors, BnM Team (Category) |
| **Scanner App (Web)** | `http://localhost:8081` | QC Workers, Unloaders, Gate Guards |
| **WMS API (Back-office)** | `http://localhost:3000` | Admins, Finance, SCM Leadership |

> [!NOTE]
> The URLs above assume a local dev environment. For the deployed staging/production environment, replace `localhost` with the provided server IP or Domain.

---

## 2. User Personas & Stories

To test the "Full Functionality", you should act out these personas in sequence:

### A. The Vendor (Portal)
*   **Goal**: Notify the warehouse of an upcoming delivery.
*   **Story**: "As a Vendor, I want to create an ASN (Advanced Shipping Notice) for my Open PO, so that the DC knows exactly what I am bringing and when."
*   **Action**: Login -> Select PO -> Enter Quantities -> Submit ASN.

### B. The Gate Guard (Scanner App)
*   **Goal**: Authenticate vehicle arrival and assign a dock.
*   **Story**: "As a Security Guard, I want to scan the Vendor's Vehicle Number or Appointment ID, so I can verify they have a valid ASN and start the arrival timer."
*   **Action**: Open Scanner -> Gate Entry -> Enter Vehicle/ASN ID -> Assign Dock.

### C. The QC Worker (Scanner App)
*   **Goal**: Validate physical goods against the ASN/PO.
*   **Story**: "As a QC Worker, I want to scan product barcodes and enter batch/expiry details, so the system can verify the shipment meets commercial and safety rules."
*   **Action**: Select Dock -> Start Unloading -> Scan Barcode -> Enter Batch/Expiry -> Accept/Hold.

---

## 3. Recommended Test Data (Seed Data)

Use the following data points to test the system without having to guess valid IDs.

### Open Purchase Orders (POs)
Use these to start the workflow in the **Vendor Portal**:
*   **PO-88291** (Vendor: Patanjali Foods) - Includes Rice and Oil.
*   **PO-88292** (Vendor: Amul Dairy) - Includes Milk (**Perishable/Cold Chain**).
*   **PO-88293** (Vendor: Britannia) - Includes Biscuits.

### Valid Product Barcodes
Use these when prompted to scan in the **Scanner App**:
*   **8901234567890** (India Gate Basmati 5kg)
*   **8909876543210** (Patanjali Mustard Oil 1L)
*   **8904900000001** (Amul Full Cream Milk 1L)
*   **8901063011092** (Britannia Good Day 200g)

### Vendor Details
*   **VND-001**: Patanjali Foods Ltd
*   **VND-002**: Amul Dairy Corp
*   **GSTIN Reference**: `27AABCT1234Z1Z1` (Standard for testing)

---

## 4. End-to-End Testing Workflow (The "Golden Path")

Follow these steps to test a complete "User Story" from start to finish:

1.  **Vendor Action**:
    *   Open the **Vendor Portal** (`:3001`).
    *   Search for **PO-88291**.
    *   Create an **ASN** for 1,200 units of Rice and 840 units of Oil.
    *   Submit and note the **ASN ID**.

2.  **Security Action**:
    *   Open the **Scanner App** (`:8081`).
    *   Go to **Gate Entry**.
    *   Enter the **ASN ID** from Step 1.
    *   Assign the truck to **Dock-01**.

3.  **QC Action**:
    *   In the **Scanner App**, select **Receiving** -> **Dock-01**.
    *   Scan barcode `8901234567890`.
    *   Enter Batch `B-001` and an Expiry date 6 months in the future.
    *   Confirm quantity and **Finalize Receipt**.

4.  **Verification**:
    *   Check the **WMS API** or Database to see if the `Auto-GRN` has triggered and the stock state is updated to `Accepted`.

---

## 5. Troubleshooting for Team
*   **Scanner doesn't open?** Ensure you have the Expo Go app if testing on mobile, or use the `--web` flag if testing on a browser.
*   **PO Not Found?** Ensure the `seed_blr01.sql` script has been run against your database.
*   **GST Mismatch?** If the scanner shows a red alert, check if the Invoice GST matches the PO GST (5% vs 12%).
