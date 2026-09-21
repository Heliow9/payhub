import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkerHealth } from './WorkerHealth';

describe('WorkerHealth', () => {
  it('diferencia worker sem resposta do conector', () => {
    render(<WorkerHealth health={{ status:'STALE',phase:'NORMALIZING',currentJobId:44,lastHeartbeatAt:'2026-09-20T18:00:00Z' }}/>);
    expect(screen.getByText('Worker sem resposta')).toBeInTheDocument();
    expect(screen.getByText(/Gerando holerites/)).toBeInTheDocument();
    expect(screen.getByText(/job #44/)).toBeInTheDocument();
  });
  it('mostra offline quando não existe heartbeat', () => {
    render(<WorkerHealth health={null}/>);
    expect(screen.getByText('Worker offline')).toBeInTheDocument();
  });
});
