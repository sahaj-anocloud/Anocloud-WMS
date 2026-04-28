import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const QUEUE_KEY = '@wms_sync_queue';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export interface OfflineTransaction {
  id: string;
  txn_type: 'GATE_ENTRY' | 'SCAN' | 'QC_PASS' | 'BATCH_CAPTURE' | 'PRINT_LPN' | 'QUARANTINE_PLACE';
  payload: any;
  captured_at: string;
  dc_id: string;
  user_id: string;
  device_id: string;
}

export class OfflineSyncService {
  static async enqueue(txn: Omit<OfflineTransaction, 'id' | 'captured_at'>) {
    const queueJson = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: OfflineTransaction[] = queueJson ? JSON.parse(queueJson) : [];

    const newTxn: OfflineTransaction = {
      ...txn,
      id: Math.random().toString(36).substring(7),
      captured_at: new Date().toISOString(),
    };

    queue.push(newTxn);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    console.log('Transaction enqueued:', newTxn.txn_type);
  }

  static async sync() {
    const queueJson = await AsyncStorage.getItem(QUEUE_KEY);
    if (!queueJson) return;

    const queue: OfflineTransaction[] = JSON.parse(queueJson);
    if (queue.length === 0) return;

    try {
      // Replay in chronological order
      const response = await axios.post(`${API_BASE_URL}/scanner/sync`, {
        transactions: queue
      });

      const results = response.data.results;
      // Filter out applied transactions
      const remaining = queue.filter(txn => {
        const result = results.find((r: any) => r.id === txn.id);
        return !result || result.status !== 'applied';
      });

      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
      return results;
    } catch (err) {
      console.error('Sync failed:', err);
      throw err;
    }
  }

  static async getQueueSize() {
    const queueJson = await AsyncStorage.getItem(QUEUE_KEY);
    const queue = queueJson ? JSON.parse(queueJson) : [];
    return queue.length;
  }
}
