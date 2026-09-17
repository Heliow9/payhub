import { useState } from 'react';
import { Modal } from './Modal';

export interface PayrollSearchInput {
  year: number;
  month: number;
  types: number[];
}

const typeOptions = [
  { value: 2, label: '2 — Mensal' },
  { value: 3, label: '3 — Adiantamento 13º' },
  { value: 4, label: '4 — 13º salário' },
  { value: 6, label: '6 — Rescisão' },
];

const monthOptions = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function PayrollSearchModal({
  title,
  subtitle,
  defaultTypes,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  defaultTypes: number[];
  onClose(): void;
  onSubmit(input: PayrollSearchInput): Promise<void>;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [types, setTypes] = useState<number[]>(defaultTypes.length ? [...new Set(defaultTypes)] : [2]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleType(value: number) {
    setTypes((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value].sort((a, b) => a - b));
  }

  async function submit() {
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || types.length === 0) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({ year, month, types });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao iniciar a busca de holerites.');
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={title} onClose={onClose}>
    {subtitle && <p className="muted small">{subtitle}</p>}
    <div className="form-grid two">
      <label>Competência
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {monthOptions.map((label, index) => <option key={label} value={index + 1}>{String(index + 1).padStart(2, '0')} — {label}</option>)}
        </select>
      </label>
      <label>Ano
        <input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(Number(e.target.value))}/>
      </label>
    </div>
    <div className="form-section">
      <span className="label strong">Tipos de holerite</span>
      <div className="check-grid">
        {typeOptions.map((option) => <label className="check-card" key={option.value}>
          <input type="checkbox" checked={types.includes(option.value)} onChange={() => toggleType(option.value)}/>
          <span>{option.label}</span>
        </label>)}
      </div>
    </div>
    <div className="lookup-card">
      <div className="grow">
        <strong>Busca manual</strong>
        <span>Consulta somente a competência e os tipos selecionados nesta execução. As automações do grupo não são alteradas.</span>
      </div>
    </div>
    {error && <div className="form-error">{error}</div>}
    <div className="modal-actions">
      <button className="secondary-button" onClick={onClose}>Cancelar</button>
      <button className="primary-button" disabled={busy || types.length === 0 || year < 2000 || year > 2100} onClick={() => void submit()}>{busy ? 'Enfileirando…' : 'Buscar holerites'}</button>
    </div>
  </Modal>;
}
