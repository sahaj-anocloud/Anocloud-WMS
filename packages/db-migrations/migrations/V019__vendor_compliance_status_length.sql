BEGIN;

ALTER TABLE vendors ALTER COLUMN compliance_status TYPE VARCHAR(30);

ALTER TABLE vendors DROP CONSTRAINT vendors_compliance_status_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_compliance_status_check 
  CHECK (compliance_status IN ('Active', 'Suspended', 'Pending', 'PendingSecondApproval'));

COMMIT;
