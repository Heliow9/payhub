import { beforeEach,describe,expect,it,vi } from 'vitest';
import { api } from './client';

describe('ações administrativas de PIN e relatório',()=>{
  beforeEach(()=>{vi.restoreAllMocks();document.cookie='payhub_csrf=csrf-test';});

  it('envia reset de PIN com POST autenticado e CSRF',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(null,{status:204}));vi.stubGlobal('fetch',fetchMock);
    await api.resetEmployeePin(42);
    expect(fetchMock).toHaveBeenCalledWith('/api/employees/42/reset-pin',expect.objectContaining({method:'POST',credentials:'include'}));
    const headers=fetchMock.mock.calls[0]![1].headers as Headers;expect(headers.get('x-csrf-token')).toBe('csrf-test');
  });

  it('gera a URL do PDF com situação e Centro de Custo escolhidos',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(new Blob(['pdf']),{status:200,headers:{'content-disposition':'attachment; filename="relatorio.pdf"'}}));vi.stubGlobal('fetch',fetchMock);
    const file=await api.signatureStatusReport('PENDING',9);
    expect(fetchMock).toHaveBeenCalledWith('/api/payrolls/report/signatures.pdf?status=PENDING&groupId=9',expect.objectContaining({credentials:'include'}));
    expect(file.filename).toBe('relatorio.pdf');
  });
});
