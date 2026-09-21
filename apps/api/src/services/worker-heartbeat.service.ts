import type { Pool } from 'mysql2/promise';

export type WorkerPhase='IDLE'|'CLAIMING'|'NORMALIZING'|'SCHEDULING'|'NOTIFYING';
export class WorkerHeartbeatService{
  constructor(private pool:Pool,private workerName='payhub-worker'){}
  async update(instanceId:string,status:'STARTING'|'RUNNING'|'STOPPING'|'ERROR',phase:WorkerPhase,currentJobId:number|null,error:string|null=null,cycle:'START'|'FINISH'|null=null):Promise<void>{
    await this.pool.execute(`INSERT INTO worker_heartbeats (worker_name,instance_id,status,phase,current_job_id,last_cycle_started_at,last_cycle_finished_at,last_heartbeat_at,last_error,updated_at) VALUES (?,?,?,?,?,IF(?='START',UTC_TIMESTAMP(),NULL),IF(?='FINISH',UTC_TIMESTAMP(),NULL),UTC_TIMESTAMP(),?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE instance_id=VALUES(instance_id),status=VALUES(status),phase=VALUES(phase),current_job_id=VALUES(current_job_id),last_cycle_started_at=IF(?='START',UTC_TIMESTAMP(),last_cycle_started_at),last_cycle_finished_at=IF(?='FINISH',UTC_TIMESTAMP(),last_cycle_finished_at),last_heartbeat_at=UTC_TIMESTAMP(),last_error=VALUES(last_error),updated_at=UTC_TIMESTAMP()`,[this.workerName,instanceId,status,phase,currentJobId,cycle,cycle,error,cycle,cycle]);
  }
}
