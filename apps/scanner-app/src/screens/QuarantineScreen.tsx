import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
import { OfflineSyncService } from '../services/sync.service';

const REASONS = [
  'Damaged Packaging',
  'Leaking Product',
  'Incorrect Batch',
  'Near Expiry',
  'Mismatch with PO',
  'Quality Concern',
];

export const QuarantineScreen = ({ navigation }: any) => {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  const handleQuarantine = async () => {
    if (!selectedReason) return;
    try {
      await OfflineSyncService.enqueue({
        txn_type: 'QUARANTINE_PLACE',
        payload: { 
          reason: selectedReason,
          scanned_barcode: '8901234567890' // Hardcoded demo barcode
        },
        dc_id: 'DC-001',
        user_id: 'USR-101',
        device_id: 'DEV-992',
      });
    } catch(err) {
      console.error('Failed to queue quarantine event', err);
    } finally {
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={Typography.h2}>Quarantine Stock</Text>
        <Text style={Typography.body}>Select reason for isolation</Text>
      </View>

      <ScrollView style={styles.list}>
        {REASONS.map((reason, i) => (
          <TouchableOpacity 
            key={i} 
            style={[styles.reasonRow, selectedReason === reason && styles.selectedRow]}
            onPress={() => setSelectedReason(reason)}
          >
            <Text style={[styles.reasonText, selectedReason === reason && styles.selectedText]}>{reason}</Text>
            {selectedReason === reason && (
              <View style={styles.checkCircle}>
                <Text style={{ color: Colors.secondary, fontWeight: 'bold' }}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.button, !selectedReason && styles.disabledButton]} 
          onPress={handleQuarantine}
          disabled={!selectedReason}
        >
          <Text style={styles.buttonText}>CONFIRM QUARANTINE</Text>
        </TouchableOpacity>
      </View>
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
  list: {
    flex: 1,
    padding: Spacing.md,
  },
  reasonRow: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  selectedRow: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  reasonText: {
    ...Typography.body,
  },
  selectedText: {
    color: Colors.primary,
    fontWeight: 'bold',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  button: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: Colors.border,
  },
  buttonText: {
    ...Typography.body,
    fontWeight: '700',
  },
});
