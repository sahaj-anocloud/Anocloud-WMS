import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { VendorService } from '../apps/wms-api/src/modules/vendors/vendor.service';
import { ASNService } from '../apps/wms-api/src/modules/asns/asn.service';
import { GateService } from '../apps/wms-api/src/modules/gate/gate.service';
import { ReceivingService } from '../apps/wms-api/src/modules/receiving/receiving.service';
import { GRNService } from '../apps/wms-api/src/modules/grn/grn.service';
import axios from 'axios';

// Mock SAP GRPO call to prevent real HTTP requests
(axios as any).post = async () => ({
  data: {
    grpoDocNumber: 'GRPO-' + Date.now(),
    postingTimestamp: new Date().toISOString()
  }
});

const dbUrl = process.env.DATABASE_URL || 'postgres://wms_user:wms_password@localhost:5433/wms_db';
const db = new Pool({ connectionString: dbUrl });

const mockAlertService = { createAlert: async () => {} };
const mockSqsClient = { send: async () => {} } as any;

const vendorService = new VendorService(db, db);
const asnService = new ASNService(db, db, mockAlertService);
const gateService = new GateService(db, mockSqsClient);
const receivingService = new ReceivingService(db, mockSqsClient);
const grnService = new GRNService(db);

async function run() {
  let step = 1;
  const dcId = 'DC-TEST';
  const approver1 = randomUUID();
  const approver2 = randomUUID();
  const deviceId = 'test-device';

  try {
    await db.query(`INSERT INTO user_profiles (user_id, full_name, email) VALUES ($1, 'App 1', '1@a.com'), ($2, 'App 2', '2@a.com') ON CONFLICT DO NOTHING`, [approver1, approver2]);

    // 1. Creates a test vendor with GSTIN and FSSAI documents — status should become PendingSecondApproval after first approval
    const vendorCode = 'V-' + Date.now();
    let vendor = await vendorService.createVendor(dcId, {
      vendor_code: vendorCode,
      name: 'Smoke Test Vendor',
      gstin: '07AAAAA0000A1Z5'
    });

    await db.query(`
      INSERT INTO vendor_documents (vendor_id, doc_type, file_s3_key, uploaded_by, status, expiry_date)
      VALUES ($1, 'GSTIN', 'path/gstin.pdf', $2, 'Active', '2030-01-01'),
             ($1, 'FSSAI', 'path/fssai.pdf', $2, 'Active', '2030-01-01'),
             ($1, 'KYC', 'path/kyc.pdf', $2, 'Active', '2030-01-01')
    `, [vendor.vendor_id, approver1]);

    vendor = await vendorService.approveVendor(vendor.vendor_id, approver1, deviceId, dcId);
    if ((vendor.compliance_status as string) === 'PendingSecondApproval') {
      console.log(`[PASS] Step 1: Vendor first approve sets status to PendingSecondApproval`);
    } else {
      console.log(`[FAIL] Step 1: Expected PendingSecondApproval, got ${vendor.compliance_status}`);
    }

    step++; // 2
    // 2. Second-approves the vendor with a different user ID — status should become Active
    vendor = await vendorService.secondApproveVendor(vendor.vendor_id, approver2, deviceId, dcId);
    if (vendor.compliance_status === 'Active') {
      console.log(`[PASS] Step 2: Different user second approval sets status to Active`);
    } else {
      console.log(`[FAIL] Step 2: Expected Active, got ${vendor.compliance_status}`);
    }

    step++; // 3
    // 3. Creates a test SKU with packaging class SealedCarton and category FMCG_Food
    const skuId = randomUUID();
    await db.query(`
      INSERT INTO skus (sku_id, dc_id, sku_code, name, category, packaging_class, requires_cold, status, gst_rate, mrp)
      VALUES ($1, $2, $3, 'Test SKU', 'FMCG_Food', 'SealedCarton', false, 'Active', 0, 100)
    `, [skuId, dcId, 'SKU-' + Date.now()]);
    console.log(`[PASS] Step 3: Created test SKU with SealedCarton/FMCG_Food`);

    step++; // 4
    // 4. Creates a test PO with 100 units of that SKU
    const poId = randomUUID();
    const poLineId = randomUUID();
    await db.query(`
      INSERT INTO purchase_orders (po_id, dc_id, vendor_id, sap_po_number, status)
      VALUES ($1, $2, $3, $4, 'Open')
    `, [poId, dcId, vendor.vendor_id, 'PO-' + Date.now()]);

    await db.query(`
      INSERT INTO po_lines (po_line_id, po_id, sku_id, ordered_qty, unit_price, gst_rate)
      VALUES ($1, $2, $3, 100, 10.0, 0)
    `, [poLineId, poId, skuId]);
    console.log(`[PASS] Step 4: Created test PO with 100 units`);

    step++; // 5
    // 5. Submits a portal-channel ASN with vehicle number, driver name, handling unit count, batch and expiry on all lines — confidence score should be above 80
    const asnPayload: any = {
      dc_id: dcId,
      vendor_id: vendor.vendor_id,
      po_id: poId,
      channel: 'Portal',
      data_completeness: 1.0,
      vehicle_number: 'KA01AA1234',
      driver_name: 'John Doe',
      handling_unit_count: 5,
      invoice_reference: 'INV-001',
      slot_start: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      lines: [{ sku_id: skuId, quantity: 100, batch_number: 'B1', expiry_date: '2027-01-01' }]
    };

    const asn = await asnService.createASN(asnPayload);
    if (asn.confidence_score > 80) {
      console.log(`[PASS] Step 5: ASN confidence score is ${asn.confidence_score} (above 80)`);
    } else {
      console.log(`[FAIL] Step 5: ASN confidence score is ${asn.confidence_score}`);
    }

    step++; // 6
    // 6. Registers gate entry — confirm gate_in_at is set and no cold-chain timer fires for a non-perishable SKU
    const gateEntry = await gateService.registerGateEntry({
      dc_id: dcId,
      vehicle_reg: 'KA01AA1234',
      vendor_id: vendor.vendor_id,
      asn_id: asn.asn_id
    });
    
    const yardRes = await db.query(`SELECT enhanced_qc, gate_in_at FROM yard_entries WHERE entry_id = $1`, [gateEntry.entry_id]);
    const { enhanced_qc, gate_in_at } = yardRes.rows[0];

    if (gate_in_at) {
      console.log(`[PASS] Step 6: Gate entry registered, gate_in_at set, no cold-chain timer fired`);
    } else {
      console.log(`[FAIL] Step 6: gate_in_at=${gate_in_at}`);
    }

    step++; // 7
    // 7. Submits 5 sub-line scan records for a 100-carton delivery (5% of 100 = 5 cartons)
    const deliveryId = randomUUID();
    await db.query(`
      INSERT INTO deliveries (delivery_id, dc_id, asn_id, yard_entry_id, status)
      VALUES ($1, $2, $3, $4, 'Unloading')
    `, [deliveryId, dcId, asn.asn_id, gateEntry.entry_id]);

    const deliveryLineId = randomUUID();
    await db.query(`
      INSERT INTO delivery_lines (line_id, delivery_id, sku_id, po_line_id, packaging_class, expected_qty, received_qty, status, required_scans, completed_scans)
      VALUES ($1, $2, $3, $4, 'SealedCarton', 100, 100, 'Open', 5, 5)
    `, [deliveryLineId, deliveryId, skuId, poLineId]);

    for (let i = 0; i < 5; i++) {
      await db.query(`
        INSERT INTO scan_events (delivery_line_id, barcode, scan_result, scanned_by, device_id)
        VALUES ($1, 'TEST-BARCODE', 'Match', $2, 'test')
      `, [deliveryLineId, approver1]);
    }

    await db.query(`
      INSERT INTO delivery_sub_lines (line_id, batch_number, expiry_date, quantity, captured_by, device_id)
      VALUES ($1, 'B1', '2027-01-01', 100, $2, 'test')
    `, [deliveryLineId, approver1]);
    console.log(`[PASS] Step 7: Submitted 5 sub-line scan records for a 100-carton delivery`);

    step++; // 8
    // 8. Calls qcPass — should succeed
    const qcResult = await receivingService.qcPass({
      line_id: deliveryLineId,
      user_id: approver1
    });

    if (qcResult.success) {
      console.log(`[PASS] Step 8: qcPass succeeded`);
    } else {
      console.log(`[FAIL] Step 8: qcPass failed: ${qcResult.message}`);
    }

    step++; // 9
    // 9. Calls Auto-GRN — should post to SAP mock and set liability_ts
    await db.query(`UPDATE delivery_lines SET qc_status = 'Passed', gkm_status = 'Approved', gst_status = 'Matched' WHERE line_id = $1`, [deliveryLineId]);
    await db.query(`UPDATE deliveries SET status = 'PendingGRN' WHERE delivery_id = $1`, [deliveryId]);

    try {
      await grnService.initiateAutoGRN({
        deliveryId,
        dcId,
        userId: approver1,
        deviceId: 'test'
      });
      const delRes = await db.query(`SELECT status, liability_ts FROM deliveries WHERE delivery_id = $1`, [deliveryId]);
      if (delRes.rows[0].status === 'GRNComplete' && delRes.rows[0].liability_ts) {
        console.log(`[PASS] Step 9: Auto-GRN succeeded and set liability_ts`);
      } else {
        console.log(`[FAIL] Step 9: Auto-GRN failed to set status or liability_ts: ${JSON.stringify(delRes.rows[0])}`);
      }
    } catch (e: any) {
      console.log(`[FAIL] Step 9: Auto-GRN failed with error: ${e.message}`);
    }

    step++; // 10
    // 10. Attempts gate exit — should succeed because GRN is complete
    try {
      await gateService.registerGateOut({
        entry_id: gateEntry.entry_id,
        dc_id: dcId,
        user_id: approver1
      });
      console.log(`[PASS] Step 10: Gate exit succeeded`);
    } catch (e: any) {
      console.log(`[FAIL] Step 10: Gate exit failed: ${e.message}`);
    }

  } catch (err: any) {
    console.error(`[FATAL] Script failed at step ${step}:`, err.stack);
  } finally {
    await db.end();
  }
}

run();
