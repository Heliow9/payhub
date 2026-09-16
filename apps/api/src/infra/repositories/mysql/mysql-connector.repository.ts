import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  Connector,
  ConnectorRepository,
  CreateConnectorInput,
  HeartbeatConnectorInput,
} from '../../../domain/connectors/connector.repository.js';

interface ConnectorRow extends RowDataPacket {
  id: number;
  name: string;
  token_hash: string;
  machine_name: string | null;
  status: 'PENDING' | 'ONLINE' | 'OFFLINE' | 'DISABLED';
  last_seen_at: Date | null;
  last_ip_address: string | null;
  metadata_json: string | null;
  created_by_user_id: number;
  created_at: Date;
  updated_at: Date;
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function mapConnector(row: ConnectorRow): Connector {
  return {
    id: Number(row.id),
    name: row.name,
    tokenHash: row.token_hash,
    machineName: row.machine_name,
    status: row.status,
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at) : null,
    lastIpAddress: row.last_ip_address,
    metadata: parseMetadata(row.metadata_json),
    createdByUserId: Number(row.created_by_user_id),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class MySqlConnectorRepository implements ConnectorRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateConnectorInput): Promise<Connector> {
    const now = new Date();
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO connectors
        (name, token_hash, status, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, 'PENDING', ?, ?, ?)`,
      [input.name, input.tokenHash, input.createdByUserId, now, now],
    );
    const connector = await this.findById(result.insertId);
    if (!connector) throw new Error('Conector criado não pôde ser carregado.');
    return connector;
  }

  async findById(id: number): Promise<Connector | null> {
    const [rows] = await this.pool.execute<ConnectorRow[]>(
      'SELECT * FROM connectors WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] ? mapConnector(rows[0]) : null;
  }

  async list(): Promise<Connector[]> {
    const [rows] = await this.pool.query<ConnectorRow[]>(
      'SELECT * FROM connectors ORDER BY created_at DESC, id DESC',
    );
    return rows.map(mapConnector);
  }

  async heartbeat(id: number, input: HeartbeatConnectorInput): Promise<Connector | null> {
    const connector = await this.findById(id);
    if (!connector || connector.status === 'DISABLED') return null;
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;
    await this.pool.execute(
      `UPDATE connectors
       SET machine_name = COALESCE(?, machine_name),
           status = 'ONLINE',
           last_seen_at = ?,
           last_ip_address = ?,
           metadata_json = ?,
           updated_at = ?
       WHERE id = ? AND status <> 'DISABLED'`,
      [input.machineName ?? null, input.at, input.ipAddress ?? null, metadata, input.at, id],
    );
    return this.findById(id);
  }
}
