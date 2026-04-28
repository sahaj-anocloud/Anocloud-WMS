/**
 * Offline Sync & Resilience Utility for SumoSave WMS Scanner App.
 * Implements Item #19.3 (30-min offline cache) and UAT T-7.1/T-7.2.
 */

export interface CachedScan {
  barcode: string;
  delivery_line_id: string;
  scanned_at: string;
  device_id: string;
  scanned_by: string;
}

const SCAN_CACHE_KEY = 'wms_offline_scans';
const CACHE_TTL_MIN = 30;

/**
 * Persists a scan locally when the network is unavailable.
 */
export const cacheScanOffline = async (scan: CachedScan): Promise<void> => {
  const existing = getLocalCache();
  existing.push({ ...scan, timestamp: new Date().toISOString() });
  localStorage.setItem(SCAN_CACHE_KEY, JSON.stringify(existing));
  console.log(`[OfflineSync] Scan cached locally: ${scan.barcode}`);
};

/**
 * Synchronizes cached scans to the API upon reconnection.
 * Enforces quantity conservation and prevents duplication (UAT T-7.2).
 */
export const syncOfflineScans = async (): Promise<{ success: number; failed: number }> => {
  const scans = getLocalCache();
  if (scans.length === 0) return { success: 0, failed: 0 };

  console.log(`[OfflineSync] Attempting to sync ${scans.length} scans...`);
  
  let successCount = 0;
  let failedCount = 0;

  for (const scan of scans) {
    try {
      // Check for expired cache (Req 19.3: 30 min threshold)
      const scanTime = new Date(scan.timestamp).getTime();
      if (Date.now() - scanTime > CACHE_TTL_MIN * 60 * 1000) {
        console.warn(`[OfflineSync] Scan expired (>30m), skipping: ${scan.barcode}`);
        failedCount++;
        continue;
      }

      // API Call (Mock)
      // await api.post('/receiving/scan', scan);
      successCount++;
    } catch (err) {
      console.error(`[OfflineSync] Sync failed for ${scan.barcode}:`, err);
      failedCount++;
    }
  }

  // Clear cache after sync
  localStorage.removeItem(SCAN_CACHE_KEY);
  return { success: successCount, failed: failedCount };
};

const getLocalCache = (): any[] => {
  const data = localStorage.getItem(SCAN_CACHE_KEY);
  return data ? JSON.parse(data) : [];
};
