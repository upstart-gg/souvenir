import type {
  MemoryChunk,
  MemoryNode,
  MemoryRelationship,
  MemorySession,
  SearchResult,
} from "../types.ts";
import type { DatabaseClient } from "./client.ts";

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
    metadata: Record<string, unknown> = {},
  ): Promise<MemoryNode> {
    const embeddingArray = embedding ? `[${embedding.join(",")}]` : null;

    // Debug logging removed

    const query = this.db.query;
    const rows = await query`
      INSERT INTO memory_nodes (content, embedding, node_type, metadata)
      VALUES (${content}, ${embeddingArray}, ${nodeType}, ${query.json(metadata as Parameters<typeof query.json>[0])})
      RETURNING *
    `;

    const row = rows[0];
    if (!row) throw new Error("Failed to create node");

    const createdNode = this.mapNode(row as Record<string, unknown>);
    // Debug logging removed

    return createdNode;
  }

  async getNode(id: string): Promise<MemoryNode | null> {
    const [row] = await this.db.query`
      SELECT * FROM memory_nodes WHERE id = ${id}
    `;

    return row ? this.mapNode(row) : null;
  }

  async updateNode(
    sessionId: string,
    nodeId: string,
    updates: Partial<MemoryNode>,
  ): Promise<MemoryNode | null> {
    const setSets: string[] = [];
    if (updates.content !== undefined) {
      setSets.push(`content = '${updates.content.replace(/'/g, "''")}'`);
    }
    if (updates.embedding !== undefined) {
      setSets.push(`embedding = '${JSON.stringify(updates.embedding)}'`);
    }
    if (updates.metadata !== undefined) {
      setSets.push(`metadata = '${JSON.stringify(updates.metadata)}'`);
    }

    if (setSets.length === 0) {
      return this.getNode(nodeId);
    }

    try {
      const rows = await this.db.query`
        UPDATE memory_nodes 
        SET updated_at = NOW(), ${setSets.join(", ")}
        WHERE session_id = ${sessionId} AND id = ${nodeId} 
        RETURNING *
      `;
      const row = rows[0];
      return row ? this.mapNode(row as Record<string, unknown>) : null;
    } catch (error) {
      console.error("Error updating node:", error);
      return null;
    }
  }

  async deleteNode(id: string): Promise<void> {
    await this.db.query`DELETE FROM memory_nodes WHERE id = ${id}`;
  }

  async findNodeByContentAndType(
    content: string,
    nodeType: string,
  ): Promise<MemoryNode | null> {
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
    nodeTypes?: string[],
  ): Promise<SearchResult[]> {
    const embeddingArray = `[${embedding.join(",")}]`;
    // Debug metrics removed

    let rows: Record<string, unknown>[];
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

    return rows.map((row: Record<string, unknown>) => ({
      node: this.mapNode(row),
      score: parseFloat(row.score as string),
    }));
  }

  // ============ Memory Relationships ============

  async createRelationship(
    sourceId: string,
    targetId: string,
    relationshipType: string,
    weight: number = 1.0,
    metadata: Record<string, unknown> = {},
  ): Promise<MemoryRelationship> {
    const rows = await this.db.query`
      INSERT INTO memory_relationships (source_id, target_id, relationship_type, weight, metadata)
      VALUES (${sourceId}, ${targetId}, ${relationshipType}, ${weight}, ${this.db.query.json(metadata as Parameters<typeof this.db.query.json>[0])})
      RETURNING *
    `;

    const row = rows[0];
    if (!row) throw new Error("Failed to create relationship");
    return this.mapRelationship(row as Record<string, unknown>);
  }

  async getRelationshipsForNode(
    nodeId: string,
    types?: string[],
  ): Promise<MemoryRelationship[]> {
    let rows: Record<string, unknown>[];

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

    return rows.map((row: Record<string, unknown>) =>
      this.mapRelationship(row),
    );
  }

  async deleteRelationship(id: string): Promise<void> {
    await this.db.query`DELETE FROM memory_relationships WHERE id = ${id}`;
  }

  // ============ Memory Sessions ============

  async createSession(
    id: string,
    sessionName?: string,
    metadata: Record<string, unknown> = {},
  ): Promise<MemorySession> {
    const rows = await this.db.query`
      INSERT INTO memory_sessions (id, session_name, metadata)
      VALUES (${id}, ${sessionName || null}, ${this.db.query.json(metadata as Parameters<typeof this.db.query.json>[0])})
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `;

    const row = rows[0];
    // If no row returned, session already exists - fetch it
    if (!row) {
      const existing = await this.getSession(id);
      if (existing) return existing;
      throw new Error("Failed to create session");
    }
    return this.mapSession(row as Record<string, unknown>);
  }

  async getSession(id: string): Promise<MemorySession | null> {
    const [row] = await this.db.query`
      SELECT * FROM memory_sessions WHERE id = ${id}
    `;

    return row ? this.mapSession(row) : null;
  }

  async addNodeToSession(sessionId: string, nodeId: string): Promise<void> {
    try {
      await this.db.query`
        INSERT INTO session_nodes (session_id, node_id)
        VALUES (${sessionId}, ${nodeId})
        ON CONFLICT DO NOTHING
      `;
    } catch (error) {
      // If we get a foreign key error, the session might not exist
      // Try to create it and then insert again
      if (
        error instanceof Error &&
        error.message.includes("session_nodes_session_id_fkey")
      ) {
        // Create the session first with the specific sessionId
        await this.db.query`
          INSERT INTO memory_sessions (id, metadata)
          VALUES (${sessionId}, '{}')
          ON CONFLICT DO NOTHING
        `;
        // Try again
        await this.db.query`
          INSERT INTO session_nodes (session_id, node_id)
          VALUES (${sessionId}, ${nodeId})
          ON CONFLICT DO NOTHING
        `;
      } else {
        throw error;
      }
    }
  }

  async getNodesInSession(sessionId: string): Promise<MemoryNode[]> {
    try {
      const rows = await this.db.query`
        SELECT mn.* FROM memory_nodes mn
        JOIN session_nodes sn ON mn.id = sn.node_id
        WHERE sn.session_id = ${sessionId}
        ORDER BY sn.added_at DESC
      `;

      return rows.map((row: Record<string, unknown>) => this.mapNode(row));
    } catch (error) {
      // Log error for debugging but return empty array
      console.error("Error getting nodes in session:", error);
      return [];
    }
  }

  // ============ Memory Chunks ============

  async createChunk(
    content: string,
    chunkIndex: number,
    sourceIdentifier?: string,
    metadata: Record<string, unknown> = {},
  ): Promise<MemoryChunk> {
    const metadataJson = this.db.query.json(
      metadata as Parameters<typeof this.db.query.json>[0],
    );
    const rows = await this.db.query`
      INSERT INTO memory_chunks (content, chunk_index, source_identifier, metadata)
      VALUES (${content}, ${chunkIndex}, ${sourceIdentifier || null}, ${metadataJson})
      RETURNING *
    `;

    const row = rows[0];
    if (!row) throw new Error("Failed to create chunk");
    return this.mapChunk(row as Record<string, unknown>);
  }

  async getUnprocessedChunks(
    sessionId?: string,
    limit: number = 100,
  ): Promise<MemoryChunk[]> {
    let rows: Record<string, unknown>[];

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

    return rows.map((row: Record<string, unknown>) => this.mapChunk(row));
  }

  async markChunkProcessed(id: string): Promise<void> {
    await this.db
      .query`UPDATE memory_chunks SET processed = TRUE WHERE id = ${id}`;
  }

  // ============ Mappers ============

  private mapNode(row: Record<string, unknown>): MemoryNode {
    return {
      id: row.id as string,
      content: row.content as string,
      embedding: (row.embedding as number[] | null) || undefined,
      metadata: (row.metadata as Record<string, unknown>) || {},
      nodeType: row.node_type as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapRelationship(row: Record<string, unknown>): MemoryRelationship {
    return {
      id: row.id as string,
      sourceId: row.source_id as string,
      targetId: row.target_id as string,
      relationshipType: row.relationship_type as string,
      weight: parseFloat(row.weight as string),
      metadata: (row.metadata as Record<string, unknown>) || {},
      createdAt: new Date(row.created_at as string),
    };
  }

  private mapSession(row: Record<string, unknown>): MemorySession {
    return {
      id: row.id as string,
      sessionName: (row.session_name as string | null) || undefined,
      metadata: (row.metadata as Record<string, unknown>) || {},
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapChunk(row: Record<string, unknown>): MemoryChunk {
    return {
      id: row.id as string,
      content: row.content as string,
      chunkIndex: row.chunk_index as number,
      sourceIdentifier: (row.source_identifier as string | null) || undefined,
      metadata: (row.metadata as Record<string, unknown>) || {},
      processed: row.processed as boolean,
      createdAt: new Date(row.created_at as string),
    };
  }
}
