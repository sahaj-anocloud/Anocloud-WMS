import React, { useRef, useEffect } from 'react';
import { TextInput, View, StyleSheet } from 'react-native';
import { Colors, Spacing } from '../theme';

interface ScanInputProps {
  onScan: (barcode: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const ScanInput: React.FC<ScanInputProps> = ({ onScan, placeholder, autoFocus = true }) => {
  const inputRef = useRef<TextInput>(null);

  const handleTextChange = (text: string) => {
    // Laser scanners usually suffix with Enter (\n)
    if (text.endsWith('\n')) {
      const barcode = text.trim();
      if (barcode) {
        onScan(barcode);
        inputRef.current?.clear();
      }
    }
  };

  const handleSubmit = (e: any) => {
    const barcode = e.nativeEvent.text.trim();
    if (barcode) {
      onScan(barcode);
      inputRef.current?.clear();
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
        style={styles.input}
        placeholder={placeholder || "Scan Barcode..."}
        placeholderTextColor={Colors.textSecondary}
        onChangeText={handleTextChange}
        onSubmitEditing={handleSubmit}
        autoFocus={autoFocus}
        blurOnSubmit={false} // Keep focus for next scan
        showSoftInputOnFocus={false} // Don't show keyboard for scanner input
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
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
});
