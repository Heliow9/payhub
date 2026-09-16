import type {
  Connector,
  ConnectorRepository,
  CreateConnectorInput,
  HeartbeatConnectorInput,
} from '../../../domain/connectors/connector.repository.js';

export class MemoryConnectorRepository implements ConnectorRepository {
  private items: Connector[] = [];
  private nextId = 1;

  async create(input: CreateConnectorInput): Promise<Connector> {
    const now = new Date();
    const connector: Connector = {
      id: this.nextId++,
      name: input.name,
      tokenHash: input.tokenHash,
      machineName: null,
      status: 'PENDING',
      lastSeenAt: null,
      lastIpAddress: null,
      metadata: null,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(connector);
    return { ...connector };
  }

  async findById(id: number): Promise<Connector | null> {
    const connector = this.items.find((item) => item.id === id);
    return connector ? { ...connector } : null;
  }

  async list(): Promise<Connector[]> {
    return [...this.items].sort((a, b) => b.id - a.id).map((item) => ({ ...item }));
  }

  async heartbeat(id: number, input: HeartbeatConnectorInput): Promise<Connector | null> {
    const connector = this.items.find((item) => item.id === id);
    if (!connector || connector.status === 'DISABLED') return null;
    connector.machineName = input.machineName ?? connector.machineName;
    connector.status = 'ONLINE';
    connector.lastSeenAt = input.at;
    connector.lastIpAddress = input.ipAddress ?? null;
    connector.metadata = input.metadata ?? null;
    connector.updatedAt = input.at;
    return { ...connector };
  }
}
