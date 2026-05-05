/**
 * CameraScanner — camera-based barcode scanner using expo-camera CameraView.
 *
 * Supports all barcode formats relevant to warehouse operations:
 *   EAN-13, EAN-8, Code 128, Code 39, QR, Data Matrix, ITF-14, GS1-128
 *
 * Usage:
 *   <CameraScanner onScan={(barcode) => handleScan(barcode)} />
 *
 * The component:
 *  - Requests camera permission on mount
 *  - Shows a scanning reticle overlay
 *  - Debounces repeated scans of the same barcode (500ms cooldown)
 *  - Vibrates on successful scan
 *  - Falls back gracefully if camera permission is denied
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Animated,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import { Colors, Spacing, Typography } from '../theme';

// ─── Barcode types relevant to WMS ───────────────────────────────────────────

const WMS_BARCODE_TYPES = [
  'ean13',
  'ean8',
  'code128',
  'code39',
  'qr',
  'datamatrix',
  'itf14',
  'codabar',
  'upc_a',
  'upc_e',
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface CameraScannerProps {
  /** Called with the raw barcode string when a barcode is detected */
  onScan: (barcode: string) => void;
  /** Optional label shown above the reticle */
  label?: string;
  /** Whether scanning is currently active (parent can pause it) */
  active?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const CameraScanner: React.FC<CameraScannerProps> = ({
  onScan,
  label = 'Point camera at barcode',
  active = true,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flash animation for successful scan
  const flashAnim = useRef(new Animated.Value(0)).current;

  const triggerFlash = useCallback(() => {
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [flashAnim]);

  const handleBarCodeScanned = useCallback(
    ({ data, type }: BarcodeScanningResult) => {
      if (!active) return;
      if (!data || data === lastScanned) return; // Debounce same barcode

      // Set cooldown to prevent duplicate fires
      setLastScanned(data);
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      cooldownRef.current = setTimeout(() => setLastScanned(null), 500);

      // Haptic feedback
      if (Platform.OS !== 'web') {
        Vibration.vibrate(50);
      }

      triggerFlash();
      onScan(data);
    },
    [active, lastScanned, onScan, triggerFlash],
  );

  // ── Permission: loading ────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Requesting camera permission…</Text>
      </View>
    );
  }

  // ── Permission: denied ────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          Camera permission is needed to scan barcodes. Please grant access to continue.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
          accessibilityLabel="Grant camera permission"
          accessibilityRole="button"
        >
          <Text style={styles.permissionButtonText}>GRANT PERMISSION</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Camera view ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container} accessibilityLabel="Camera barcode scanner">
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: WMS_BARCODE_TYPES,
        }}
        onBarcodeScanned={active ? handleBarCodeScanned : undefined}
      >
        {/* Scan flash overlay */}
        <Animated.View
          style={[styles.flashOverlay, { opacity: flashAnim }]}
          pointerEvents="none"
        />

        {/* Reticle overlay */}
        <View style={styles.overlay}>
          {/* Top dark area */}
          <View style={styles.overlayTop} />

          {/* Middle row: dark | reticle | dark */}
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.reticle}>
              {/* Corner markers */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              {/* Scan line */}
              <View style={styles.scanLine} />
            </View>
            <View style={styles.overlaySide} />
          </View>

          {/* Bottom dark area with label */}
          <View style={styles.overlayBottom}>
            <Text style={styles.scanLabel} accessibilityLiveRegion="polite">
              {label}
            </Text>
            {lastScanned && (
              <Text style={styles.lastScannedText} accessibilityLiveRegion="assertive">
                ✓ {lastScanned}
              </Text>
            )}
          </View>
        </View>
      </CameraView>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const RETICLE_SIZE = 260;
const CORNER_SIZE = 24;
const CORNER_THICKNESS = 4;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 320,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 255, 136, 0.35)',
    zIndex: 10,
  },
  // ── Overlay ──────────────────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: RETICLE_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.sm,
  },
  // ── Reticle ───────────────────────────────────────────────────────────────
  reticle: {
    width: RETICLE_SIZE,
    height: RETICLE_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: Colors.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: 4,
  },
  scanLine: {
    position: 'absolute',
    top: '50%',
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: Colors.primary,
    opacity: 0.8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  // ── Labels ────────────────────────────────────────────────────────────────
  scanLabel: {
    ...Typography.caption,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontSize: 13,
  },
  lastScannedText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '700',
    marginTop: Spacing.xs,
    fontSize: 12,
    textAlign: 'center',
  },
  // ── Permission screen ─────────────────────────────────────────────────────
  permissionContainer: {
    width: '100%',
    height: 200,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  permissionTitle: {
    ...Typography.h2,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  permissionText: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  permissionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButtonText: {
    color: Colors.secondary,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1,
  },
});
