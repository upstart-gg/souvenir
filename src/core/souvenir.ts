import { DatabaseClient } from '../db/client.js';
import { MemoryRepository } from '../db/repository.js';
import { GraphOperations } from '../graph/operations.js';
import { SouvenirProcessor } from './processor.js';
import { chunkText } from '../utils/chunking.js';
import {
  SouvenirConfig,
  AddOptions,
  SearchOptions,
  SouvenirProcessOptions,
  SearchResult,
  MemoryNode,
  MemorySession,
  EmbeddingProvider,
  GraphPath,
  TraversalOptions,
} from '../types.js';
import type { EmbedParams } from 'ai';

/**
 * Main Souvenir class - Memory management for AI agents
 *
 * Uses an ETL-inspired pipeline: Extract, Transform, Load
 */
export class Souvenir {
  private db: DatabaseClient;
  private repository: MemoryRepository;
  private graph: GraphOperations;
  private processor?: SouvenirProcessor;
  private embedding?: EmbeddingProvider;

  constructor(
    private config: SouvenirConfig,
    options?: {
      embeddingProvider?: EmbeddingProvider;
      processorModel?: Parameters<typeof import('ai').generateText>[0]['model'];
    }
  ) {
    this.db = new DatabaseClient(config.databaseUrl);
    this.repository = new MemoryRepository(this.db);
    this.graph = new GraphOperations(this.repository);

    if (options?.embeddingProvider) {
      this.embedding = options.embeddingProvider;
    }

    if (options?.processorModel) {
      this.processor = new SouvenirProcessor(options.processorModel);
    }
  }

  // ============ Core API ============

  /**
   * Add data to memory (Extract phase)
   * Chunks the data and stores it for later processing
   */
  async add(data: string, options: AddOptions = {}): Promise<string[]> {
    const { sourceIdentifier, metadata = {}, sessionId } = options;

    // Chunk the data
    const chunks = chunkText(data, {
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
    });

    const chunkIds: string[] = [];

    // Store chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = await this.repository.createChunk(
        chunks[i],
        i,
        sourceIdentifier,
        metadata
      );
      chunkIds.push(chunk.id);
    }

    return chunkIds;
  }

  /**
   * Process chunks into memory nodes (Transform phase)
   * Extracts entities, relationships, and generates embeddings
   */
  async processAll(options: SouvenirProcessOptions = {}): Promise<void> {
    const { generateEmbeddings = true, sessionId } = options;

    const chunks = await this.repository.getUnprocessedChunks();

    if (chunks.length === 0) {
      return;
    }

    // Process chunks in batches
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      await Promise.all(
        batch.map((chunk) => this.processChunk(chunk, { ...options, generateEmbeddings }))
      );
    }

      // If session provided, create relationships between nodes in session
    if (sessionId && this.processor) {
      await this.createSessionRelationships(sessionId);
    }
  }

  /**
   * Process a single chunk
   */
  private async processChunk(
    chunk: typeof this.repository extends MemoryRepository
      ? Awaited<ReturnType<MemoryRepository['createChunk']>>
      : never,
    options: SouvenirProcessOptions & { generateEmbeddings?: boolean }
  ): Promise<void> {
    const { sessionId, generateEmbeddings = true } = options;

    // Generate embedding for the chunk
    let embedding: number[] | null = null;
    if (generateEmbeddings && this.embedding) {
      embedding = await this.embedding.embed(chunk.content);
    }

    // Create memory node for the chunk itself
    const chunkNode = await this.repository.createNode(
      chunk.content,
      embedding,
      'chunk',
      {
        ...chunk.metadata,
        sourceIdentifier: chunk.sourceIdentifier,
        chunkIndex: chunk.chunkIndex,
      }
    );

    // Add to session if provided
    if (sessionId) {
      await this.repository.addNodeToSession(sessionId, chunkNode.id);
    }

    // Extract entities and relationships if processor available
    if (this.processor) {
      const { entities, relationships, summary } = await this.processor.processChunk(
        chunk,
        options
      );

      // Create nodes for entities
      const entityNodes = await Promise.all(
        entities.map(async (entity) => {
          const entityEmbedding = generateEmbeddings && this.embedding
            ? await this.embedding.embed(entity.text)
            : null;

          const node = await this.repository.createNode(
            entity.text,
            entityEmbedding,
            entity.type,
            { ...entity.metadata, extractedFrom: chunk.id }
          );

          // Connect entity to chunk
          await this.repository.createRelationship(
            chunkNode.id,
            node.id,
            'contains',
            1.0,
            {}
          );

          if (sessionId) {
            await this.repository.addNodeToSession(sessionId, node.id);
          }

          return node;
        })
      );

      // Create relationships between entities
      for (const rel of relationships) {
        const sourceNode = entityNodes.find((n) => n.content === rel.source);
        const targetNode = entityNodes.find((n) => n.content === rel.target);

        if (sourceNode && targetNode) {
          await this.repository.createRelationship(
            sourceNode.id,
            targetNode.id,
            rel.type,
            rel.weight || 1.0,
            {}
          );
        }
      }

      // Update chunk node with summary
      await this.repository.updateNode(chunkNode.id, {
        metadata: { ...chunkNode.metadata, summary },
      });
    }

    // Mark chunk as processed
    await this.repository.markChunkProcessed(chunk.id);
  }

  /**
   * Create relationships between nodes in a session based on semantic similarity
   */
  private async createSessionRelationships(sessionId: string): Promise<void> {
    const nodes = await this.repository.getNodesInSession(sessionId);

    // Create relationships between semantically similar nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const node1 = nodes[i];
        const node2 = nodes[j];

        if (!node1.embedding || !node2.embedding) continue;

        // Calculate cosine similarity
        const similarity = this.cosineSimilarity(node1.embedding, node2.embedding);

        // Create relationship if similarity is high enough
        if (similarity >= 0.8) {
          await this.repository.createRelationship(
            node1.id,
            node2.id,
            'similar_to',
            similarity,
            { similarity }
          );
        }
      }
    }
  }

  /**
   * Search memory using vector similarity
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.embedding) {
      throw new Error('Embedding provider not configured');
    }

    const {
      sessionId,
      nodeTypes,
      limit = this.config.maxResults,
      minScore = this.config.minRelevanceScore,
      includeRelationships = false,
      relationshipTypes,
    } = options;

    // Generate embedding for query
    const queryEmbedding = await this.embedding.embed(query);

    // Search by vector
    let results = await this.repository.searchByVector(
      queryEmbedding,
      limit * 2, // Get more initially for filtering
      minScore,
      nodeTypes
    );

    // Filter by session if provided
    if (sessionId) {
      const sessionNodes = await this.repository.getNodesInSession(sessionId);
      const sessionNodeIds = new Set(sessionNodes.map((n) => n.id));
      results = results.filter((r) => sessionNodeIds.has(r.node.id));
    }

    // Limit to requested number
    results = results.slice(0, limit);

    // Include relationships if requested
    if (includeRelationships) {
      for (const result of results) {
        result.relationships = await this.repository.getRelationshipsForNode(
          result.node.id,
          relationshipTypes
        );
      }
    }

    return results;
  }

  // ============ Session Management ============

  async createSession(name?: string, metadata?: Record<string, unknown>): Promise<MemorySession> {
    return this.repository.createSession(name, metadata);
  }

  async getSession(id: string): Promise<MemorySession | null> {
    return this.repository.getSession(id);
  }

  // ============ Graph Operations ============

  async findPaths(
    startNodeId: string,
    endNodeId: string,
    options?: TraversalOptions
  ): Promise<GraphPath[]> {
    return this.graph.findPaths(startNodeId, endNodeId, options);
  }

  async getNeighborhood(
    nodeId: string,
    options?: TraversalOptions
  ): Promise<{ nodes: MemoryNode[]; relationships: import('../types.js').MemoryRelationship[] }> {
    return this.graph.getNeighborhood(nodeId, options);
  }

  async findClusters(sessionId?: string, minClusterSize?: number): Promise<MemoryNode[][]> {
    return this.graph.findClusters(sessionId, minClusterSize);
  }

  // ============ Direct Node Access ============

  async getNode(id: string): Promise<MemoryNode | null> {
    return this.repository.getNode(id);
  }

  async deleteNode(id: string): Promise<void> {
    await this.repository.deleteNode(id);
  }

  // ============ Utility ============

  async healthCheck(): Promise<boolean> {
    return this.db.healthCheck();
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
