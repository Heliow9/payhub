export const SIGNATURE_EVIDENCE_DISCLOSURE =
  'Estou ciente de que, para compor a evidência desta assinatura, o PayHub registra data e hora, endereço IP, informações técnicas do dispositivo e do aplicativo ou navegador, dados da sessão, integridade do documento e, quando o dispositivo permitir, localização geográfica (latitude, longitude, precisão e endereço aproximado), além da assinatura desenhada quando utilizada.';

export function withSignatureEvidenceDisclosure(text: string): string {
  const base = text.trim();
  if (!base) return SIGNATURE_EVIDENCE_DISCLOSURE;
  const normalized = base.toLocaleLowerCase('pt-BR');
  if (normalized.includes('localização geográfica') && normalized.includes('endereço ip')) return base;
  return `${base} ${SIGNATURE_EVIDENCE_DISCLOSURE}`;
}

export function withoutSignatureEvidenceDisclosure(text: string): string {
  const value = text.trim();
  if (!value) return value;
  const exactSuffix = ` ${SIGNATURE_EVIDENCE_DISCLOSURE}`;
  if (value.endsWith(exactSuffix)) return value.slice(0, -exactSuffix.length).trim();
  if (value === SIGNATURE_EVIDENCE_DISCLOSURE) return '';
  return value;
}
