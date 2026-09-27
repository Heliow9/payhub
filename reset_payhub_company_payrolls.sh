#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${PAYHUB_ROOT:-/var/www/payhub}"
DB_NAME="${PAYHUB_DB_NAME:-pay_hub}"
TARGET="${1:-}"
MODE="${2:-}"

if [[ -z "$TARGET" ]]; then
  echo "Uso:"
  echo "  sudo bash $0 <slug-ou-id-da-empresa>"
  echo "  sudo bash $0 <slug-ou-id-da-empresa> --execute"
  echo
  echo "Empresas disponíveis:"
  sudo mysql -t "$DB_NAME" -e "SELECT id,slug,display_name,status FROM companies ORDER BY id;"
  exit 2
fi

if [[ ! "$TARGET" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "ERRO: informe somente o ID numérico ou o slug da empresa."
  exit 2
fi

cd "$ROOT"

MYSQL=(sudo mysql -N -B "$DB_NAME")
MYSQL_TABLE=(sudo mysql -t "$DB_NAME")

if [[ "$TARGET" =~ ^[0-9]+$ ]]; then
  COMPANY_ROW="$("${MYSQL[@]}" -e "SELECT id,slug,display_name FROM companies WHERE id=${TARGET} LIMIT 1;")"
else
  COMPANY_ROW="$("${MYSQL[@]}" -e "SELECT id,slug,display_name FROM companies WHERE slug='${TARGET}' LIMIT 1;")"
fi

if [[ -z "$COMPANY_ROW" ]]; then
  echo "ERRO: empresa '${TARGET}' não encontrada em ${DB_NAME}."
  exit 1
fi

IFS=$'\t' read -r COMPANY_ID COMPANY_SLUG COMPANY_NAME <<< "$COMPANY_ROW"

STORAGE_ROOT="/opt/payhub/storage"
if [[ -f "$ROOT/.env" ]]; then
  ENV_STORAGE="$(grep -E '^DOCUMENT_STORAGE_PATH=' "$ROOT/.env" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  if [[ -n "${ENV_STORAGE:-}" ]]; then
    STORAGE_ROOT="$ENV_STORAGE"
  fi
fi
COMPANY_PAYROLL_STORAGE="${STORAGE_ROOT}/companies/${COMPANY_ID}/payrolls"

echo
echo "=============================================================="
echo " PayHub - RESET SOMENTE DOS HOLERITES"
echo "=============================================================="
echo " Empresa : ${COMPANY_NAME}"
echo " Slug    : ${COMPANY_SLUG}"
echo " ID      : ${COMPANY_ID}"
echo " Banco   : ${DB_NAME}"
echo
echo "SERÃO PRESERVADOS:"
echo "  ✓ empresa"
echo "  ✓ usuários MASTER / ANALISTA"
echo "  ✓ funcionários"
echo "  ✓ identidades e PINs dos funcionários"
echo "  ✓ grupos e vínculos dos funcionários"
echo "  ✓ horários/automações dos grupos"
echo "  ✓ configurações da empresa"
echo "  ✓ conector Sage"
echo
echo "SERÃO ZERADOS:"
echo "  • holerites"
echo "  • itens dos holerites"
echo "  • PDFs original / assinado / recibo"
echo "  • solicitações, links e evidências de assinatura"
echo "  • cadeia de eventos de assinatura"
echo "  • logs de acesso/verificação dos documentos"
echo "  • execuções de geração de holerites (payroll_runs)"
echo "  • jobs PAYROLL_IMPORT e seus lotes/logs"
echo
echo "As execuções da agenda do dia serão preservadas para impedir que o"
echo "worker gere novamente os mesmos holerites logo após o reset."
echo

echo "CONTAGEM ATUAL:"
"${MYSQL_TABLE[@]}" -e "
SELECT 'Funcionários (preservar)' item,COUNT(*) total FROM employees WHERE company_id=${COMPANY_ID}
UNION ALL
SELECT 'Grupos (preservar)',COUNT(*) FROM employee_groups WHERE company_id=${COMPANY_ID}
UNION ALL
SELECT 'Holerites',COUNT(*) FROM payrolls WHERE company_id=${COMPANY_ID}
UNION ALL
SELECT 'Holerites assinados',COUNT(*) FROM payrolls WHERE company_id=${COMPANY_ID} AND status='SIGNED'
UNION ALL
SELECT 'Documentos',COUNT(*)
  FROM payroll_documents d
  JOIN payrolls p ON p.id=d.payroll_id
 WHERE p.company_id=${COMPANY_ID}
UNION ALL
SELECT 'Evidências',COUNT(*)
  FROM signature_evidence e
  JOIN payrolls p ON p.id=e.payroll_id
 WHERE p.company_id=${COMPANY_ID}
UNION ALL
SELECT 'Execuções payroll_runs',COUNT(*) FROM payroll_runs WHERE company_id=${COMPANY_ID}
UNION ALL
SELECT 'Jobs PAYROLL_IMPORT',COUNT(*)
  FROM import_jobs
 WHERE company_id=${COMPANY_ID} AND job_type='PAYROLL_IMPORT';
"

if [[ "$MODE" != "--execute" ]]; then
  echo
  echo "MODO DE CONFERÊNCIA: nada foi apagado."
  echo
  echo "Se a empresa acima estiver correta, execute:"
  echo "  sudo bash $0 ${COMPANY_SLUG} --execute"
  exit 0
fi

echo
read -r -p "Para confirmar, digite exatamente ZERAR-${COMPANY_SLUG}: " CONFIRM
if [[ "$CONFIRM" != "ZERAR-${COMPANY_SLUG}" ]]; then
  echo "Cancelado. Nenhum dado foi alterado."
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/home/ubuntu/payhub-reset-backups/${COMPANY_SLUG}-${STAMP}"
mkdir -p "$BACKUP_DIR"

echo
echo "[1/6] Criando backup completo do banco..."
sudo mysqldump --single-transaction --quick --routines --triggers "$DB_NAME" | gzip -1 > "$BACKUP_DIR/${DB_NAME}.sql.gz"
echo "      OK: $BACKUP_DIR/${DB_NAME}.sql.gz"

echo "[2/6] Criando backup dos arquivos de holerite..."
if [[ -d "$COMPANY_PAYROLL_STORAGE" ]]; then
  tar -C "$(dirname "$COMPANY_PAYROLL_STORAGE")" -czf "$BACKUP_DIR/payrolls-files.tar.gz" "$(basename "$COMPANY_PAYROLL_STORAGE")"
  echo "      OK: $BACKUP_DIR/payrolls-files.tar.gz"
else
  echo "      Nenhuma pasta encontrada em ${COMPANY_PAYROLL_STORAGE}"
fi

restart_payhub() {
  set +e
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart payhub-api --update-env >/dev/null 2>&1 || true
    pm2 restart payhub-worker --update-env >/dev/null 2>&1 || true
  fi
}

trap restart_payhub EXIT

echo "[3/6] Pausando API e worker..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop payhub-worker >/dev/null 2>&1 || true
  pm2 stop payhub-api >/dev/null 2>&1 || true
fi

echo "[4/6] Removendo somente dados relacionados aos holerites..."
sudo mysql "$DB_NAME" <<SQL
SET @cid := ${COMPANY_ID};

SELECT GET_LOCK(CONCAT('payhub-reset-payrolls-', @cid), 30) AS reset_lock;

START TRANSACTION;

CREATE TEMPORARY TABLE _reset_payroll_ids (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=MEMORY
SELECT id FROM payrolls WHERE company_id=@cid;

CREATE TEMPORARY TABLE _reset_request_ids (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=MEMORY
SELECT sr.id
  FROM signature_requests sr
  JOIN _reset_payroll_ids p ON p.id=sr.payroll_id;

CREATE TEMPORARY TABLE _reset_run_ids (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=MEMORY
SELECT id FROM payroll_runs WHERE company_id=@cid;

CREATE TEMPORARY TABLE _reset_job_ids (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=MEMORY
SELECT id
  FROM import_jobs
 WHERE company_id=@cid
   AND job_type='PAYROLL_IMPORT';

DELETE se
  FROM signature_events se
  JOIN _reset_request_ids r ON r.id=se.signature_request_id;

DELETE ev
  FROM signature_evidence ev
  JOIN _reset_payroll_ids p ON p.id=ev.payroll_id;

DELETE sl
  FROM signature_links sl
  JOIN _reset_request_ids r ON r.id=sl.signature_request_id;

DELETE sr
  FROM signature_requests sr
  JOIN _reset_payroll_ids p ON p.id=sr.payroll_id;

DELETE vl
  FROM document_verification_logs vl
  JOIN _reset_payroll_ids p ON p.id=vl.payroll_id;

DELETE al
  FROM document_access_logs al
  JOIN _reset_payroll_ids p ON p.id=al.payroll_id;

DELETE d
  FROM payroll_documents d
  JOIN _reset_payroll_ids p ON p.id=d.payroll_id;

DELETE i
  FROM payroll_items i
  JOIN _reset_payroll_ids p ON p.id=i.payroll_id;

DELETE p
  FROM payrolls p
  JOIN _reset_payroll_ids x ON x.id=p.id;

DELETE l
  FROM connector_job_logs l
  JOIN _reset_job_ids j ON j.id=l.job_id;

DELETE b
  FROM connector_raw_batches b
  JOIN _reset_job_ids j ON j.id=b.job_id;

DELETE j
  FROM import_jobs j
  JOIN _reset_job_ids x ON x.id=j.id;

UPDATE schedule_executions x
JOIN _reset_run_ids r ON r.id=x.payroll_run_id
   SET x.payroll_run_id=NULL,
       x.status='ENQUEUED',
       x.claim_owner=NULL,
       x.claimed_at=NULL,
       x.claim_lease_until=NULL,
       x.error_message=NULL,
       x.updated_at=UTC_TIMESTAMP();

DELETE e
  FROM payroll_run_events e
  JOIN _reset_run_ids r ON r.id=e.payroll_run_id;

DELETE r
  FROM payroll_runs r
  JOIN _reset_run_ids x ON x.id=r.id;

COMMIT;

SELECT RELEASE_LOCK(CONCAT('payhub-reset-payrolls-', @cid));
SQL

echo "[5/6] Removendo somente os arquivos físicos dos holerites..."
if [[ -d "$COMPANY_PAYROLL_STORAGE" ]]; then
  rm -rf -- "$COMPANY_PAYROLL_STORAGE"
fi
mkdir -p "$COMPANY_PAYROLL_STORAGE"
echo "      OK: ${COMPANY_PAYROLL_STORAGE} recriada vazia."

echo "[6/6] Reiniciando PayHub..."
restart_payhub
trap - EXIT
sleep 4

echo
echo "VALIDAÇÃO FINAL:"
"${MYSQL_TABLE[@]}" -e "
SELECT 'Funcionários preservados' item,COUNT(*) total FROM employees WHERE company_id=${COMPANY_ID}
UNION ALL
SELECT 'Grupos preservados',COUNT(*) FROM employee_groups WHERE company_id=${COMPANY_ID}
UNION ALL
SELECT 'Holerites restantes',COUNT(*) FROM payrolls WHERE company_id=${COMPANY_ID}
UNION ALL
SELECT 'Documentos restantes',COUNT(*)
  FROM payroll_documents d JOIN payrolls p ON p.id=d.payroll_id
 WHERE p.company_id=${COMPANY_ID}
UNION ALL
SELECT 'Execuções payroll_runs restantes',COUNT(*) FROM payroll_runs WHERE company_id=${COMPANY_ID}
UNION ALL
SELECT 'Jobs PAYROLL_IMPORT restantes',COUNT(*)
  FROM import_jobs
 WHERE company_id=${COMPANY_ID} AND job_type='PAYROLL_IMPORT';
"

echo
echo "=============================================================="
echo " RESET CONCLUÍDO"
echo " Empresa : ${COMPANY_NAME} (${COMPANY_SLUG})"
echo " Backup  : ${BACKUP_DIR}"
echo "=============================================================="
echo
echo "Funcionários e grupos foram preservados."
echo "A Central de Holerites deve iniciar com 0 documentos."
