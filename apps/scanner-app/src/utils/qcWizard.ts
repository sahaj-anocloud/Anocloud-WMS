/**
 * QC Wizard utility functions
 *
 * Pure functions used by QCWizardScreen that can be tested independently
 * of the React Native component tree.
 */

export type PackagingClass =
  | 'SealedCarton'
  | 'GunnyBag'
  | 'Rice'
  | 'ShrinkWrap'
  | 'Loose'
  | 'MixedLoad';

/**
 * Returns the plain-language instruction text for a given packaging class.
 *
 * For SealedCarton, `requiredScans` fills in N (number of cartons to open)
 * and `totalCartons` fills in the total. When `totalCartons` is omitted it
 * falls back to `requiredScans`.
 */
export function getInstructionText(
  packagingClass: PackagingClass,
  requiredScans: number,
  totalCartons?: number,
): string {
  switch (packagingClass) {
    case 'SealedCarton':
      return `Open ${requiredScans} of ${totalCartons ?? requiredScans} cartons. Scan 1 item from each opened carton.`;
    case 'GunnyBag':
      return 'Open 1 bag. Scan 1 inner item. Then enter the total bag count below.';
    case 'Rice':
      return 'Scan 1 bag. If no barcode, affix a Weight Label and scan.';
    case 'ShrinkWrap':
      return 'Scan from outside. DO NOT break packaging.';
    case 'Loose':
      return 'Scan 1 item. Then enter the total unit count below.';
    case 'MixedLoad':
      return 'Mixed load detected. Apply Sealed Carton rules. Supervisor review required.';
    default:
      return 'Follow standard scan procedure.';
  }
}

/**
 * Determines the next wizard step after all required scans are completed.
 * GunnyBag and Loose require a count entry step before confirmation.
 */
export function getNextStepAfterScanning(
  packagingClass: PackagingClass,
): 'count_entry' | 'confirmation' {
  return packagingClass === 'GunnyBag' || packagingClass === 'Loose'
    ? 'count_entry'
    : 'confirmation';
}

/**
 * Returns the count entry label for the given packaging class.
 */
export function getCountLabel(packagingClass: PackagingClass): string {
  return packagingClass === 'GunnyBag'
    ? 'Enter total bag count:'
    : 'Enter total unit count:';
}

/**
 * Returns the count type to send to the API for the given packaging class.
 */
export function getCountType(
  packagingClass: PackagingClass,
): 'physical_count' | 'unit_count' {
  return packagingClass === 'GunnyBag' ? 'physical_count' : 'unit_count';
}
