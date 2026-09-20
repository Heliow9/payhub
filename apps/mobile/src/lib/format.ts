export function money(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function dateBr(value: unknown) {
  if (!value) return '—';
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : new Date(text).toLocaleDateString('pt-BR');
}
export function dateTimeBr(value: unknown) {
  return value ? new Date(String(value)).toLocaleString('pt-BR') : '—';
}
export function cpfMask(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}
export function cpfBr(value: unknown) {
  const d = String(value ?? '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}` : String(value ?? '—');
}
export function phoneBr(value: unknown) {
  const d = String(value ?? '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return String(value || '—');
}
export function competence(row: any) { return `${String(row.month).padStart(2, '0')}/${row.year}`; }
