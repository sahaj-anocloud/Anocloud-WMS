/**
 * Localization strings for SumoSave WMS Scanner App. Item #311.
 */
export const translations = {
  en: {
    common: {
      scan: 'Scan',
      confirm: 'Confirm',
      cancel: 'Cancel',
      error: 'Error',
      success: 'Success',
      back: 'Back',
      submit: 'Submit'
    },
    receiving: {
      title: 'Inbound Receiving',
      scan_barcode: 'Scan Item Barcode',
      expected: 'Expected',
      received: 'Received',
      batch_capture: 'Capture Batch/Expiry',
      qc_pass: 'QC Pass',
      over_delivery: 'Over-delivery Detected!'
    },
    quarantine: {
      title: 'Quarantine Management',
      dwell_time: 'Dwell Time',
      resolve: 'Resolve Hold'
    }
  },
  hi: {
    common: {
      scan: 'स्कैन',
      confirm: 'पुष्टि करें',
      cancel: 'रद्द करें',
      error: 'त्रुटि',
      success: 'सफलता',
      back: 'पीछे',
      submit: 'जमा करें'
    },
    receiving: {
      title: 'इनबाउंड रिसीविंग',
      scan_barcode: 'आइटम बारकोड स्कैन करें',
      expected: 'अपेक्षित',
      received: 'प्राप्त',
      batch_capture: 'बैच/समाप्ति कैप्चर करें',
      qc_pass: 'QC पास',
      over_delivery: 'अत्यधिक वितरण पाया गया!'
    },
    quarantine: {
      title: 'क्वारंटीन प्रबंधन',
      dwell_time: 'ड्वेल टाइम',
      resolve: 'होल्ड हल करें'
    }
  }
};

export type Language = keyof typeof translations;

let currentLanguage: Language = 'en';

/**
 * Switch current UI language. Item #311.
 */
export const setLanguage = (lang: Language) => {
  currentLanguage = lang;
};

/**
 * Translation helper
 */
export const t = (path: string): string => {
  const parts = path.split('.');
  let current: any = translations[currentLanguage];
  
  for (const part of parts) {
    if (current && current[part]) {
      current = current[part];
    } else {
      return path;
    }
  }
  
  return current;
};
