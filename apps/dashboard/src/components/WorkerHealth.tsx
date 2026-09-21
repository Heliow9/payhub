type Health={
  status:'HEALTHY'|'STALE'|'OFFLINE'|'ERROR';
  phase:'IDLE'|'CLAIMING'|'NORMALIZING'|'SCHEDULING'|'NOTIFYING';
  currentJobId:number|null;
  lastHeartbeatAt:string|Date|null;
};

const phaseLabels:Record<Health['phase'],string>={
  IDLE:'Aguardando trabalho',
  CLAIMING:'Buscando trabalhos',
  NORMALIZING:'Gerando holerites',
  SCHEDULING:'Verificando agendas',
  NOTIFYING:'Processando notificações',
};

export function WorkerHealth({health}:{health?:Health|null}){
  const h=health??{status:'OFFLINE' as const,phase:'IDLE' as const,currentJobId:null,lastHeartbeatAt:null};
  const meta={
    HEALTHY:{title:'Worker operacional',tone:'success',detail:phaseLabels[h.phase]},
    STALE:{title:'Worker sem resposta',tone:'warning',detail:`Último estado conhecido: ${phaseLabels[h.phase]}`},
    OFFLINE:{title:'Worker offline',tone:'danger',detail:'O processamento automático não está respondendo.'},
    ERROR:{title:'Worker com erro',tone:'danger',detail:`Falha registrada durante: ${phaseLabels[h.phase]}`},
  }[h.status];
  const when=h.lastHeartbeatAt?new Date(h.lastHeartbeatAt instanceof Date?h.lastHeartbeatAt.getTime():h.lastHeartbeatAt).toLocaleString('pt-BR'):'sem heartbeat';
  return <div className={`worker-health ${meta.tone}`}>
    <div className="worker-health-icon">●</div>
    <div className="grow"><strong>{meta.title}</strong><span>{meta.detail}{h.currentJobId?` · job #${h.currentJobId}`:''}</span></div>
    <small>{when}</small>
  </div>;
}
