import { DatabaseClient } from './client.js';
import {
  MemoryNode,
  MemoryRelationship,
  MemorySession,
  MemoryChunk,
  SearchResult,
} from '../types.js';

/**
 * Repository for memory operations using postgres package
 */
export class MemoryRepository {
  constructor(private db: DatabaseClient) {}

  // ============ Memory Nodes ============

  async createNode(
    content: string,
    embedding: number[] | null,
    nodeType: string,
    metadata: Record<string, unknown> = {}
  ): Promise<MemoryNode> {
    const embeddingArray = embedding ? `[${embedding.join(',')}]` : null;

    const [row] = await this.db.query`
      INSERT INTO memory_nodes (content, embedding, node_type, metadata)
      VALUES (${content}, ${embeddingArray}, ${nodeType}, ${metadata})
      RETURNING *
    `;

    return this.mapNode(row);
  }

  async getNode(id: string): Promise<MemoryNode | null> {
    const [row] = await this.db.query`
      SELECT * FROM memory_nodes WHERE id = ${id}
    `;

    return row ? this.mapNode(row) : null;
  }

  async updateNode(
    id: string,
    updates: Partial<Pick<MemoryNode, 'content' | 'metadata' | 'embedding'>>
  ): Promise<MemoryNode> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.content !== undefined) {
      sets.push('content');
      values.push(updates.content);
    }

    if (updates.metadata !== undefined) {
      sets.push('metadata');
      values.push(updates.metadata);
    }

    if (updates.embedding !== undefined) {
      sets.push('embedding');
      values.push(updates.embedding ? `[${updates.embedding.join(',')}]` : null);
    }

    // Build dynamic update query
    const updateParts = sets.map((set, i) => `${set} = $${i + 1}`).join(', ');

    const [row] = await this.db.query(
      `UPDATE memory_nodes SET ${updateParts} WHERE id = $${sets.length + 1} RETURNING *`,
      [...values, id]
    );

    return this.mapNode(row);
  }

  async deleteNode(id: string): Promise<void> {
    await this.db.query`DELETE FROM memory_nodes WHERE id = ${id}`;
  }

  async findNodeByContentAndType(content: string, nodeType: string): Promise<MemoryNode | null> {
    const [row] = await this.db.query`
      SELECT * FROM memory_nodes
      WHERE content = ${content} AND node_type = ${nodeType}
      LIMIT 1
    `;

    return row ? this.mapNode(row) : null;
  }

  async searchByVector(
    embedding: number[],
    limit: number = 10,
    minScore: number = 0.7,
    nodeTypes?: string[]
  ): Promise<SearchResult[]> {
    const embeddingArray = `[${embedding.join(',')}]`;

    let rows;
    if (nodeTypes && nodeTypes.length > 0) {
      rows = await this.db.query`
        SELECT *,
               1 - (embedding <=> ${embeddingArray}::vector) as score
        FROM memory_nodes
        WHERE embedding IS NOT NULL
          AND node_type = ANY(${nodeTypes})
          AND 1 - (embedding <=> ${embeddingArray}::vector) >= ${minScore}
        ORDER BY embedding <=> ${embeddingArray}::vector
        LIMIT ${limit}
      `;
    } else {
      rows = await this.db.query`
        SELECT *,
               1 - (embedding <=> ${embeddingArray}::vector) as score
        FROM memory_nodes
        WHERE embedding IS NOT NULL
          AND 1 - (embedding <=> ${embeddingArray}::vector) >= ${minScore}
        ORDER BY embedding <=> ${embeddingArray}::vector
        LIMIT ${limit}
      `;
    }

    return rows.map((row: any) => ({
      node: this.mapNode(row),
      score: parseFloat(row.score),
    }));
  }

  // ============ Memory Relationships ============

  async createRelationship(
    sourceId: string,
    targetId: string,
    relationshipType: string,
    weight: number = 1.0,
    metadata: Record<string, unknown> = {}
  ): Promise<MemoryRelationship> {
    const [row] = await this.db.query`
      INSERT INTO memory_relationships (source_id, target_id, relationship_type, weight, metadata)
      VALUES (${sourceId}, ${targetId}, ${relationshipType}, ${weight}, ${metadata})
      RETURNING *
    `;

    return this.mapRelationship(row);
  }

  async getRelationshipsForNode(
    nodeId: string,
    types?: string[]
  ): Promise<MemoryRelationship[]> {
    let rows;

    if (types && types.length > 0) {
      rows = await this.db.query`
        SELECT * FROM memory_relationships
        WHERE (source_id = ${nodeId} OR target_id = ${nodeId})
          AND relationship_type = ANY(${types})
      `;
    } else {
      rows = await this.db.query`
        SELECT * FROM memory_relationships
        WHERE source_id = ${nodeId} OR target_id = ${nodeId}
      `;
    }

    return rows.map((row: any) => this.mapRelationship(row));
  }

  async deleteRelationship(id: string): Promise<void> {
    await this.db.query`DELETE FROM memory_relationships WHERE id = ${id}`;
  }

  // ============ Memory Sessions ============

  async createSession(
    sessionName?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<MemorySession> {
    const [row] = await this.db.query`
      INSERT INTO memory_sessions (session_name, metadata)
      VALUES (${sessionName || null}, ${metadata})
      RETURNING *
    `;

    return this.mapSession(row);
  }

  async getSession(id: string): Promise<MemorySession | null> {
    const [row] = await this.db.query`
      SELECT * FROM memory_sessions WHERE id = ${id}
    `;

    return row ? this.mapSession(row) : null;
  }

  async addNodeToSession(sessionId: string, nodeId: string): Promise<void> {
    await this.db.query`
      INSERT INTO session_nodes (session_id, node_id)
      VALUES (${sessionId}, ${nodeId})
      ON CONFLICT DO NOTHING
    `;
  }

  async getNodesInSession(sessionId: string): Promise<MemoryNode[]> {
    const rows = await this.db.query`
      SELECT mn.* FROM memory_nodes mn
      JOIN session_nodes sn ON mn.id = sn.node_id
      WHERE sn.session_id = ${sessionId}
      ORDER BY sn.added_at DESC
    `;

    return rows.map((row: any) => this.mapNode(row));
  }

  // ============ Memory Chunks ============

  async createChunk(
    content: string,
    chunkIndex: number,
    sourceIdentifier?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<MemoryChunk> {
    const [row] = await this.db.query`
      INSERT INTO memory_chunks (content, chunk_index, source_identifier, metadata)
      VALUES (${content}, ${chunkIndex}, ${sourceIdentifier || null}, ${metadata})
      RETURNING *
    `;

    return this.mapChunk(row);
  }

  async getUnprocessedChunks(sessionId?: string, limit: number = 100): Promise<MemoryChunk[]> {
    let rows;

    if (sessionId) {
      // Filter by sessionId stored in chunk metadata
      rows = await this.db.query`
        SELECT * FROM memory_chunks
        WHERE processed = FALSE
          AND metadata->>'sessionId' = ${sessionId}
        ORDER BY created_at ASC
        LIMIT ${limit}
      `;
    } else {
      // Get all unprocessed chunks
      rows = await this.db.query`
        SELECT * FROM memory_chunks
        WHERE processed = FALSE
        ORDER BY created_at ASC
        LIMIT ${limit}
      `;
    }

    return rows.map((row: any) => this.mapChunk(row));
  }

  async markChunkProcessed(id: string): Promise<void> {
    await this.db.query`UPDATE memory_chunks SET processed = TRUE WHERE id = ${id}`;
  }

  // ============ Mappers ============

  private mapNode(row: any): MemoryNode {
    return {
      id: row.id,
      content: row.content,
      embedding: row.embedding,
      metadata: row.metadata || {},
      nodeType: row.node_type,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRelationship(row: any): MemoryRelationship {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      relationshipType: row.relationship_type,
      weight: parseFloat(row.weight),
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
    };
  }

  private mapSession(row: any): MemorySession {
    return {
      id: row.id,
      sessionName: row.session_name,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapChunk(row: any): MemoryChunk {
    return {
      id: row.id,
      content: row.content,
      chunkIndex: row.chunk_index,
      sourceIdentifier: row.source_identifier,
      metadata: row.metadata || {},
      processed: row.processed,
      createdAt: new Date(row.created_at),
    };
  }
}
