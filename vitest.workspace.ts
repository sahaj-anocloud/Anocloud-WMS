import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'apps/wms-api/vitest.config.ts',
  // vendor-portal and scanner-app use their own vitest configs when added
]);
