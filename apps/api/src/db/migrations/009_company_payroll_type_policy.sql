ALTER TABLE app_settings
  ADD COLUMN enabled_payroll_types_json VARCHAR(64) NOT NULL DEFAULT '[2,3,4,6]' AFTER acceptance_text;

UPDATE app_settings
   SET enabled_payroll_types_json='[2,3,4,6]'
 WHERE enabled_payroll_types_json IS NULL
    OR TRIM(enabled_payroll_types_json)='';
