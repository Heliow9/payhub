export type ConnectorStatus = 'PENDING' | 'ONLINE' | 'OFFLINE' | 'DISABLED';

export interface Connector {
  id: number;
  name: string;
  tokenHash: string;
  machineName: string | null;
  status: ConnectorStatus;
  lastSeenAt: Date | null;
  lastIpAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdByUserId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateConnectorInput {
  name: string;
  tokenHash: string;
  createdByUserId: number;
}

export interface HeartbeatConnectorInput {
  machineName?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
  at: Date;
}

export interface ConnectorRepository {
  create(input: CreateConnectorInput): Promise<Connector>;
  findById(id: number): Promise<Connector | null>;
  list(): Promise<Connector[]>;
  heartbeat(id: number, input: HeartbeatConnectorInput): Promise<Connector | null>;
}
