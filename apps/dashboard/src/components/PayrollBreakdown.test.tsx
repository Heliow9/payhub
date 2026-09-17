import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PayrollBreakdown } from './PayrollBreakdown';

describe('PayrollBreakdown',()=>{
  it('mostra resumo discriminativo sem reproduzir o recibo impresso',()=>{
    render(<PayrollBreakdown data={{status:'SIGNED',payroll_type_label:'Mensal',gross_amount:2706.37,deduction_amount:571.17,net_amount:2135.20,items:[{eventCode:'1',description:'SALARIO NORMAL',referenceValue:'30/30',nature:'EARNING',amount:2134.06},{eventCode:'76',description:'DESCONTO DE ATRASOS',referenceValue:'14:37',nature:'DEDUCTION',amount:161.71}]}}/>);
    expect(screen.getByText('Eventos da folha')).toBeInTheDocument();
    expect(screen.getByText('SALARIO NORMAL')).toBeInTheDocument();
    expect(screen.getByText('VENCIMENTOS')).toBeInTheDocument();
    expect(screen.queryByText('Recibo de Pagamento de Salário')).not.toBeInTheDocument();
  });
});
