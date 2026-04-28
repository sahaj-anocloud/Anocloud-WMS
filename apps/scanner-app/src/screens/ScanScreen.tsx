import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Vibration, TouchableOpacity } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
import { ScanInput } from '../components/ScanInput';
import { OfflineSyncService } from '../services/sync.service';
import { useAuth } from '../contexts/AuthContext';
import { Platform } from 'react-native';

interface ScanEvent {
  id: string;
  barcode: string;
  status: 'match' | 'mismatch' | 'unexpected';
  timestamp: string;
}

export const ScanScreen = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [pendingSync, setPendingSync] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    OfflineSyncService.getQueueSize().then(setPendingSync);
  }, []);

  const handleManualSync = async () => {
    if (pendingSync === 0) return;
    setLoading(true);
    try {
      await OfflineSyncService.sync();
      const count = await OfflineSyncService.getQueueSize();
      setPendingSync(count);
      Vibration.vibrate(50); // Success pulse
    } catch (err) {
      Vibration.vibrate(500); // Error vibration
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (barcode: string) => {
    console.log('Scanned:', barcode);
    
    const device_id = `${Platform.OS}-ID-${Math.random().toString(36).substring(7)}`;

    const session = {
      dc_id: user?.dcId || 'DC-MOCK-01',
      user_id: user?.id || 'USR-MOCK-999',
      device_id
    };

    // Enqueue for background sync
    await OfflineSyncService.enqueue({
      txn_type: 'SCAN',
      payload: { 
        barcode,
        scan_source: 'LPN_VERIFY',
        order_ref: 'PO-88291'
      },
      dc_id: session.dc_id,
      user_id: session.user_id,
      device_id: session.device_id,
    });

    const count = await OfflineSyncService.getQueueSize();
    setPendingSync(count);
    
    // Immediate local feedback (BR-04: Immediate Pulse)
    const isMatch = barcode.startsWith('LPN');
    if (isMatch) {
      Vibration.vibrate(50);
    } else {
      Vibration.vibrate([0, 400]);
    }

    const newEvent: ScanEvent = {
      id: Math.random().toString(36).substring(7),
      barcode,
      status: isMatch ? 'match' : 'unexpected',
      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    setEvents(prev => [newEvent, ...prev]);
    
    // Background sync attempt
    handleManualSync().catch(() => {});
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={Typography.h2}>Scanning PO-88291</Text>
        <Text style={Typography.body}>Target: 50 / Scanned: {events.filter(e => e.status === 'match').length}</Text>
      </View>

      {pendingSync > 0 && (
        <TouchableOpacity style={styles.syncBar} onPress={handleManualSync}>
          <Text style={styles.syncText}>{pendingSync} OFFLINE SCANS PENDING SYNC</Text>
        </TouchableOpacity>
      )}

      <View style={styles.scanArea}>
        <ScanInput onScan={handleScan} />
      </View>

      <FlatList
        data={events}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[styles.eventRow, { borderColor: item.status === 'match' ? Colors.primary : Colors.error }]}>
            <View>
              <Text style={styles.barcodeText}>{item.barcode}</Text>
              <Text style={Typography.caption}>{item.timestamp}</Text>
            </View>
            <Text style={[styles.statusText, { color: item.status === 'match' ? Colors.primary : Colors.error }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
  },
  scanArea: {
    padding: Spacing.md,
  },
  syncBar: {
    backgroundColor: Colors.accent,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  syncText: {
    fontSize: 10,
    fontWeight: '900',
    color: Colors.secondary,
  },
  listContent: {
    padding: Spacing.md,
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.sm,
    borderLeftWidth: 4,
  },
  barcodeText: {
    ...Typography.body,
    fontWeight: 'bold',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
