/**
 * ScanInput — unified barcode input supporting two modes:
 *
 *  1. CAMERA mode  — uses CameraScanner (expo-camera) for phone camera scanning
 *  2. HARDWARE mode — uses a hidden TextInput for Bluetooth/USB laser scanners
 *                     (scanner sends barcode + Enter keystroke)
 *
 * The mode toggle button is always visible so workers can switch based on
 * whether they have a hardware scanner attached or are using the phone camera.
 *
 * Default mode: CAMERA (most workers will use phone camera in the field)
 */

import React, { useRef, useState } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
import { CameraScanner } from './CameraScanner';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanMode = 'camera' | 'hardware';

interface ScanInputProps {
  onScan: (barcode: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Label shown inside the camera reticle */
  cameraLabel?: string;
  /** Whether scanning is active (parent can pause between scans) */
  active?: boolean;
  /** Initial mode — defaults to 'camera' */
  defaultMode?: ScanMode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ScanInput: React.FC<ScanInputProps> = ({
  onScan,
  placeholder,
  autoFocus = true,
  cameraLabel,
  active = true,
  defaultMode = 'camera',
}) => {
  const [mode, setMode] = useState<ScanMode>(defaultMode);
  const inputRef = useRef<TextInput>(null);

  // ── Hardware scanner handlers ──────────────────────────────────────────────

  const handleTextChange = (text: string) => {
    // Laser scanners suffix with Enter (\n)
    if (text.endsWith('\n')) {
      const barcode = text.trim();
      if (barcode) {
        onScan(barcode);
        inputRef.current?.clear();
      }
    }
  };

  const handleSubmit = (e: { nativeEvent: { text: string } }) => {
    const barcode = e.nativeEvent.text.trim();
    if (barcode) {
      onScan(barcode);
      inputRef.current?.clear();
    }
  };

  // ── Mode toggle ────────────────────────────────────────────────────────────

  const toggleMode = () => {
    setMode(m => (m === 'camera' ? 'hardware' : 'camera'));
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.wrapper}>
      {/* Mode toggle */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'camera' && styles.modeButtonActive]}
          onPress={() => setMode('camera')}
          accessibilityLabel="Use camera scanner"
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'camera' }}
        >
          <Text style={[styles.modeButtonText, mode === 'camera' && styles.modeButtonTextActive]}>
            📷 Camera
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'hardware' && styles.modeButtonActive]}
          onPress={() => setMode('hardware')}
          accessibilityLabel="Use hardware laser scanner"
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'hardware' }}
        >
          <Text style={[styles.modeButtonText, mode === 'hardware' && styles.modeButtonTextActive]}>
            🔫 Laser Scanner
          </Text>
        </TouchableOpacity>
      </View>

      {/* Camera mode */}
      {mode === 'camera' && (
        <CameraScanner
          onScan={onScan}
          label={cameraLabel ?? 'Point camera at barcode'}
          active={active}
        />
      )}

      {/* Hardware scanner mode */}
      {mode === 'hardware' && (
        <View style={styles.hardwareContainer}>
          <Text style={styles.hardwareHint}>
            Connect your Bluetooth or USB laser scanner and scan a barcode.
          </Text>
          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={placeholder ?? 'Waiting for scan…'}
              placeholderTextColor={Colors.textSecondary}
              onChangeText={handleTextChange}
              onSubmitEditing={handleSubmit}
              autoFocus={autoFocus}
              blurOnSubmit={false}
              showSoftInputOnFocus={false} // Don't show keyboard — scanner sends keystrokes
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Hardware scanner input"
              accessibilityHint="Scan a barcode with your hardware scanner"
            />
          </View>
          <Text style={styles.hardwareSubHint}>
            Tap the input field if the scanner loses focus.
          </Text>
          <TouchableOpacity
            style={styles.refocusButton}
            onPress={() => inputRef.current?.focus()}
            accessibilityLabel="Refocus scanner input"
            accessibilityRole="button"
          >
            <Text style={styles.refocusButtonText}>TAP TO REFOCUS</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.sm,
  },
  // ── Mode toggle ────────────────────────────────────────────────────────────
  modeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modeButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  modeButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(0, 255, 136, 0.08)',
  },
  modeButtonText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  modeButtonTextActive: {
    color: Colors.primary,
  },
  // ── Hardware mode ──────────────────────────────────────────────────────────
  hardwareContainer: {
    gap: Spacing.sm,
  },
  hardwareHint: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontSize: 12,
  },
  inputContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.md,
  },
  input: {
    color: Colors.text,
    height: 60,
    fontSize: 20,
    fontWeight: 'bold',
  },
  hardwareSubHint: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontSize: 11,
    opacity: 0.6,
  },
  refocusButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  refocusButtonText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 1,
    fontSize: 12,
  },
});
