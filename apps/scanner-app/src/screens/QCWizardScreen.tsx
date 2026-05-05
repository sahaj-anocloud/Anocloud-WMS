import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
import { ScanInput } from '../components/ScanInput';
import apiClient from '../services/api.client';
import {
  PackagingClass,
  getInstructionText,
  getNextStepAfterScanning,
  getCountLabel,
  getCountType,
} from '../utils/qcWizard';

// Re-export for consumers that import from this module
export { getInstructionText } from '../utils/qcWizard';

// ─── Types ────────────────────────────────────────────────────────────────────

type QCWizardStep = 'instructions' | 'scanning' | 'count_entry' | 'confirmation';

interface PolicyResult {
  packaging_class: PackagingClass;
  base_scan_count: number;
  sampling_modifier: number;
  asn_confidence_multiplier: number;
  required_scans: number;
  physical_count_required: boolean;
  label_affixing_required: boolean;
  cold_routing_required: boolean;
  packaging_integrity_preserve: boolean;
  mixed_load_supervisor_review: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface QCWizardScreenProps {
  route: {
    params: {
      lineId: string;
      dcId: string;
      deliveryId: string;
    };
  };
  navigation: any;
}

export const QCWizardScreen: React.FC<QCWizardScreenProps> = ({ route, navigation }) => {
  const { lineId, dcId, deliveryId } = route.params;

  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<QCWizardStep>('instructions');
  const [policy, setPolicy] = useState<PolicyResult | null>(null);
  const [completedScans, setCompletedScans] = useState(0);
  const [countValue, setCountValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<'Match' | 'Mismatch' | 'Unexpected' | null>(null);
  const [errorAcknowledged, setErrorAcknowledged] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Shake animation for scan errors
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ── Fetch policy on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const response = await apiClient.get(`/api/v1/receiving/lines/${lineId}/policy`);
        setPolicy(response.data);
      } catch (err: any) {
        Alert.alert(
          'Policy Error',
          err?.response?.data?.error || 'Failed to load scan policy. Please try again.',
          [{ text: 'Go Back', onPress: () => navigation.goBack() }],
        );
      } finally {
        setLoading(false);
      }
    };

    fetchPolicy();
  }, [lineId]);

  // ── Shake animation trigger ────────────────────────────────────────────────
  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  // ── Scan handler ───────────────────────────────────────────────────────────
  const handleScan = async (barcode: string) => {
    if (!errorAcknowledged) return; // Block scanning until error is acknowledged

    try {
      const response = await apiClient.put('/api/v1/receiving/scan', {
        barcode,
        line_id: lineId,
        dc_id: dcId,
      });

      const result: 'Match' | 'Mismatch' | 'Unexpected' = response.data?.result ?? 'Unexpected';
      setLastScanResult(result);

      if (result === 'Match') {
        const newCount = completedScans + 1;
        setCompletedScans(newCount);

        // Auto-advance when all scans are done
        if (policy && newCount >= policy.required_scans) {
          setStep(getNextStepAfterScanning(policy.packaging_class));
        }
      } else {
        // Mismatch or Unexpected — show full-screen error, require acknowledgement
        setErrorAcknowledged(false);
        setErrorMessage(
          result === 'Mismatch'
            ? 'Barcode mismatch. This item does not match the expected SKU.'
            : 'Unexpected barcode. This item was not expected in this delivery.',
        );
        triggerShake();
      }
    } catch (err: any) {
      Alert.alert('Scan Error', err?.response?.data?.error || 'Scan failed. Please try again.');
    }
  };

  // ── Count submission ───────────────────────────────────────────────────────
  const handleConfirmCount = async () => {
    const parsed = parseInt(countValue, 10);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid Count', 'Please enter a valid positive number.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.put(`/api/v1/receiving/lines/${lineId}/count`, {
        count_type: getCountType(policy!.packaging_class),
        count_value: parsed,
        dc_id: dcId,
      });
      setStep('confirmation');
    } catch (err: any) {
      Alert.alert('Count Error', err?.response?.data?.error || 'Failed to record count. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── QC Pass submission ─────────────────────────────────────────────────────
  const handleSubmitQCPass = async () => {
    setSubmitting(true);
    try {
      await apiClient.put(`/api/v1/receiving/lines/${lineId}/qc-pass`, {
        dc_id: dcId,
      });
      Alert.alert('QC Pass', 'QC inspection passed successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      const errorCode = err?.response?.data?.error;
      Alert.alert(
        'QC Pass Failed',
        errorCode
          ? `Error: ${errorCode}. ${err?.response?.data?.message ?? ''}`
          : 'Failed to submit QC pass. Please try again.',
        [{ text: 'Retry', style: 'cancel' }],
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading scan policy…</Text>
      </View>
    );
  }

  if (!policy) {
    return null;
  }

  // ── Cold chain banner ──────────────────────────────────────────────────────
  const coldBanner = policy.cold_routing_required ? (
    <View style={styles.coldBanner} testID="cold-chain-banner">
      <Text style={styles.coldBannerText}>
        ⚠ COLD CHAIN — Route to ColdZone immediately after scanning.
      </Text>
    </View>
  ) : null;

  // ── Error overlay (Mismatch / Unexpected) ──────────────────────────────────
  if (!errorAcknowledged) {
    return (
      <Animated.View
        style={[styles.errorOverlay, { transform: [{ translateX: shakeAnim }] }]}
        testID="error-overlay"
      >
        <Text style={styles.errorOverlayTitle}>⚠ SCAN ERROR</Text>
        <Text style={styles.errorOverlayMessage}>{errorMessage}</Text>
        <TouchableOpacity
          style={styles.errorAckButton}
          onPress={() => {
            setErrorAcknowledged(true);
            setLastScanResult(null);
            setErrorMessage('');
          }}
          testID="error-ack-button"
        >
          <Text style={styles.errorAckButtonText}>TAP TO CONTINUE</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── Step: Instructions ─────────────────────────────────────────────────────
  if (step === 'instructions') {
    const instructionText = getInstructionText(
      policy.packaging_class,
      policy.required_scans,
      policy.base_scan_count,
    );

    return (
      <View style={styles.container}>
        {coldBanner}
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.packagingClassLabel} testID="packaging-class-label">
              {policy.packaging_class}
            </Text>
            <Text style={Typography.caption}>Delivery Line: {lineId}</Text>
          </View>

          <View style={styles.instructionCard}>
            {policy.packaging_class === 'ShrinkWrap' && (
              <Text style={styles.warningIndicator} testID="shrinkwrap-warning">⚠</Text>
            )}
            <Text style={styles.instructionText} testID="instruction-text">
              {instructionText}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Required scans:</Text>
            <Text style={styles.infoValue}>{policy.required_scans}</Text>
          </View>

          {policy.mixed_load_supervisor_review && (
            <View style={styles.supervisorBanner} testID="supervisor-review-banner">
              <Text style={styles.supervisorBannerText}>
                🔔 Supervisor review required for this mixed load.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setStep('scanning')}
            testID="start-scanning-button"
          >
            <Text style={styles.primaryButtonText}>START SCANNING</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Step: Scanning ─────────────────────────────────────────────────────────
  if (step === 'scanning') {
    return (
      <View style={styles.container}>
        {coldBanner}
        <View style={styles.header}>
          <Text style={Typography.h2}>{policy.packaging_class}</Text>
        </View>

        <View style={styles.progressContainer} testID="progress-indicator">
          <Text style={styles.progressText}>
            Scanned:{' '}
            <Text style={styles.progressHighlight}>{completedScans}</Text>
            {' / '}
            <Text style={styles.progressHighlight}>{policy.required_scans}</Text>
          </Text>
        </View>

        <View style={styles.scanArea}>
          <ScanInput onScan={handleScan} />
        </View>

        {lastScanResult === 'Match' && (
          <View style={styles.matchBanner} testID="match-banner">
            <Text style={styles.matchBannerText}>✓ MATCH</Text>
          </View>
        )}
      </View>
    );
  }

  // ── Step: Count Entry ──────────────────────────────────────────────────────
  if (step === 'count_entry') {
    const countLabel = getCountLabel(policy.packaging_class);

    return (
      <View style={styles.container}>
        {coldBanner}
        <View style={styles.header}>
          <Text style={Typography.h2}>{policy.packaging_class}</Text>
          <Text style={Typography.body}>Scans complete: {completedScans} / {policy.required_scans}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.countLabel} testID="count-label">
            {countLabel}
          </Text>
          <TextInput
            style={styles.countInput}
            value={countValue}
            onChangeText={setCountValue}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={Colors.textSecondary}
            testID="count-input"
          />

          <TouchableOpacity
            style={[styles.primaryButton, submitting && styles.buttonDisabled]}
            onPress={handleConfirmCount}
            disabled={submitting}
            testID="confirm-count-button"
          >
            {submitting ? (
              <ActivityIndicator color={Colors.secondary} />
            ) : (
              <Text style={styles.primaryButtonText}>CONFIRM COUNT</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Step: Confirmation ─────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {coldBanner}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={Typography.h2}>QC Summary</Text>
        </View>

        <View style={styles.summaryCard} testID="summary-card">
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Packaging Class</Text>
            <Text style={styles.summaryValue}>{policy.packaging_class}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Scans Completed</Text>
            <Text style={styles.summaryValue}>
              {completedScans} / {policy.required_scans}
            </Text>
          </View>
          {(policy.packaging_class === 'GunnyBag' || policy.packaging_class === 'Loose') &&
            countValue !== '' && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {policy.packaging_class === 'GunnyBag' ? 'Bag Count' : 'Unit Count'}
                </Text>
                <Text style={styles.summaryValue}>{countValue}</Text>
              </View>
            )}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, submitting && styles.buttonDisabled]}
          onPress={handleSubmitQCPass}
          disabled={submitting}
          testID="submit-qc-pass-button"
        >
          {submitting ? (
            <ActivityIndicator color={Colors.secondary} />
          ) : (
            <Text style={styles.primaryButtonText}>SUBMIT QC PASS</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...Typography.body,
    marginTop: Spacing.md,
    color: Colors.textSecondary,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  header: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  packagingClassLabel: {
    ...Typography.h1,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  // Cold chain banner
  coldBanner: {
    backgroundColor: '#FF8F00', // Amber/orange
    padding: Spacing.sm,
    alignItems: 'center',
  },
  coldBannerText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
  // Instruction card
  instructionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  warningIndicator: {
    fontSize: 32,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    color: '#FF8F00',
  },
  instructionText: {
    ...Typography.body,
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.sm,
  },
  infoLabel: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  infoValue: {
    ...Typography.body,
    fontWeight: '700',
    color: Colors.primary,
  },
  supervisorBanner: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  supervisorBannerText: {
    color: Colors.secondary,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
  // Primary button — min 48×48dp
  primaryButton: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
    minHeight: 48,
    minWidth: 48,
  },
  primaryButtonText: {
    ...Typography.body,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.secondary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Scanning step
  progressContainer: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 22,
    color: Colors.text,
    fontWeight: '600',
  },
  progressHighlight: {
    color: Colors.primary,
    fontWeight: '800',
  },
  scanArea: {
    padding: Spacing.md,
  },
  matchBanner: {
    backgroundColor: Colors.primary,
    padding: Spacing.sm,
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    borderRadius: 8,
  },
  matchBannerText: {
    color: Colors.secondary,
    fontWeight: '900',
    fontSize: 16,
  },
  // Count entry step
  form: {
    padding: Spacing.lg,
  },
  countLabel: {
    ...Typography.body,
    fontSize: 18,
    marginBottom: Spacing.md,
    color: Colors.text,
  },
  countInput: {
    backgroundColor: Colors.surface,
    color: Colors.text,
    padding: Spacing.md,
    borderRadius: 8,
    fontSize: 24,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: Colors.border,
    textAlign: 'center',
    minHeight: 48,
  },
  // Confirmation step
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryLabel: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  summaryValue: {
    ...Typography.body,
    fontWeight: '700',
  },
  // Error overlay
  errorOverlay: {
    flex: 1,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  errorOverlayTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  errorOverlayMessage: {
    fontSize: 20,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 30,
  },
  errorAckButton: {
    backgroundColor: Colors.text,
    padding: Spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 48,
    minWidth: 48,
  },
  errorAckButtonText: {
    color: Colors.error,
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 1,
  },
});
