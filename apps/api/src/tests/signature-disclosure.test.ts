import { describe, expect, it } from 'vitest';
import { SIGNATURE_EVIDENCE_DISCLOSURE, withSignatureEvidenceDisclosure, withoutSignatureEvidenceDisclosure } from '../services/signature-disclosure.js';

describe('declaração obrigatória de evidências', () => {
  it('acrescenta a informação sobre IP, dispositivo e localização ao aceite configurável', () => {
    const result = withSignatureEvidenceDisclosure('Declaro que visualizei o holerite e conferi seu conteúdo.');
    expect(result).toContain('endereço IP');
    expect(result).toContain('localização geográfica');
    expect(result).toContain('endereço aproximado');
    expect(result).toContain('assinatura desenhada');
  });

  it('não duplica a declaração obrigatória', () => {
    const text = `Meu aceite. ${SIGNATURE_EVIDENCE_DISCLOSURE}`;
    expect(withSignatureEvidenceDisclosure(text)).toBe(text);
  });

  it('mantém o texto principal separado para a lateral do holerite', () => {
    const base = 'Declaro que visualizei o holerite referente à competência informada, conferi seu conteúdo e manifesto eletronicamente minha ciência e recebimento deste documento.';
    const full = withSignatureEvidenceDisclosure(base);
    expect(withoutSignatureEvidenceDisclosure(full)).toBe(base);
  });
});
