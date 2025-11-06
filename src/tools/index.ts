/**
 * Pre-made tools for Vercel AI SDK v5
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { Souvenir } from '../core/souvenir.js';

/**
 * Create memory tools for use with Vercel AI SDK
 */
export function createSouvenirTools(souvenir: Souvenir) {
  return {
    /**
     * Store information in memory
     */
    storeMemory: tool({
      description:
        'Store information in long-term memory for later recall. Use this to remember important facts, preferences, or context from the conversation.',
      parameters: z.object({
        content: z.string().describe('The information to store in memory'),
        sessionId: z.string().optional().describe('Optional session ID to group related memories'),
        metadata: z
          .record(z.unknown())
          .optional()
          .describe('Optional metadata about this memory'),
      }),
      execute: async ({ content, sessionId, metadata }) => {
        const chunkIds = await souvenir.add(content, {
          sessionId,
          metadata,
        });

        // Process the chunks immediately with summaries (per paper)
        await souvenir.processAll({
          sessionId,
          generateEmbeddings: true,
          generateSummaries: true,
        });

        return {
          success: true,
          chunkIds,
          message: `Stored ${chunkIds.length} memory chunk(s) with summaries`,
        };
      },
    }),

    /**
     * Search memory using vector similarity (default strategy)
     */
    searchMemory: tool({
      description:
        'Search long-term memory for relevant information using semantic similarity. Use this when you need to recall facts, preferences, or past context.',
      parameters: z.object({
        query: z.string().describe('What to search for in memory'),
        sessionId: z
          .string()
          .optional()
          .describe('Optional session ID to limit search to specific context'),
        limit: z.number().optional().describe('Maximum number of results to return (default: 5)'),
        strategy: z
          .enum(['vector', 'graph-neighborhood', 'graph-completion', 'graph-summary', 'hybrid'])
          .optional()
          .describe('Retrieval strategy (default: vector)'),
      }),
      execute: async ({ query, sessionId, limit = 5, strategy = 'vector' }) => {
        const results = await souvenir.search(query, {
          sessionId,
          limit,
          strategy,
          includeRelationships: true,
        });

        return {
          success: true,
          results: results.map((r) => ({
            content: r.node.content,
            score: r.score,
            type: r.node.nodeType,
            metadata: r.node.metadata,
            relationships: r.relationships?.length || 0,
          })),
          message:
            results.length > 0
              ? `Found ${results.length} relevant memories using ${strategy} strategy`
              : 'No relevant memories found',
        };
      },
    }),

    /**
     * Search using graph retrieval with formatted context (NEW - from paper)
     */
    searchGraph: tool({
      description:
        'Search memory using knowledge graph traversal and get results formatted for reasoning. Best for multi-hop questions requiring relationship understanding.',
      parameters: z.object({
        query: z.string().describe('What to search for in the knowledge graph'),
        sessionId: z.string().optional().describe('Optional session ID'),
        limit: z.number().optional().describe('Number of graph neighborhoods to return'),
      }),
      execute: async ({ query, sessionId, limit = 3 }) => {
        const formattedContext = await souvenir.searchGraph(query, {
          sessionId,
          limit,
        });

        return {
          success: true,
          context: formattedContext.content,
          sources: formattedContext.sources.length,
          message: `Retrieved ${formattedContext.sources.length} graph contexts`,
        };
      },
    }),

    /**
     * Get related memories based on a memory node
     */
    getRelatedMemories: tool({
      description:
        'Get memories related to a specific memory node through the knowledge graph. Useful for exploring connections between memories.',
      parameters: z.object({
        nodeId: z.string().describe('The ID of the memory node to explore from'),
        maxDepth: z
          .number()
          .optional()
          .describe('How many relationship hops to explore (default: 2)'),
      }),
      execute: async ({ nodeId, maxDepth = 2 }) => {
        const neighborhood = await souvenir.getNeighborhood(nodeId, {
          maxDepth,
        });

        return {
          success: true,
          nodes: neighborhood.nodes.map((n) => ({
            id: n.id,
            content: n.content,
            type: n.nodeType,
            metadata: n.metadata,
          })),
          relationships: neighborhood.relationships.map((r) => ({
            id: r.id,
            type: r.relationshipType,
            weight: r.weight,
            source: r.sourceId,
            target: r.targetId,
          })),
          message: `Found ${neighborhood.nodes.length} related memories with ${neighborhood.relationships.length} connections`,
        };
      },
    }),

    /**
     * Find paths between two memories
     */
    findMemoryPaths: tool({
      description:
        'Find connection paths between two memories in the knowledge graph. Useful for understanding how different pieces of information relate.',
      parameters: z.object({
        startNodeId: z.string().describe('Starting memory node ID'),
        endNodeId: z.string().describe('Target memory node ID'),
        maxDepth: z
          .number()
          .optional()
          .describe('Maximum path length to explore (default: 5)'),
      }),
      execute: async ({ startNodeId, endNodeId, maxDepth = 5 }) => {
        const paths = await souvenir.findPaths(startNodeId, endNodeId, {
          maxDepth,
        });

        return {
          success: true,
          paths: paths.map((p) => ({
            nodes: p.nodes.map((n) => ({
              id: n.id,
              content: n.content,
              type: n.nodeType,
            })),
            relationships: p.relationships.map((r) => ({
              type: r.relationshipType,
              weight: r.weight,
            })),
            totalWeight: p.totalWeight,
          })),
          message:
            paths.length > 0
              ? `Found ${paths.length} path(s) between memories`
              : 'No paths found between memories',
        };
      },
    }),

    /**
     * Create a new memory session
     */
    createSession: tool({
      description:
        'Create a new memory session to group related memories. Useful for organizing memories by conversation, topic, or time period.',
      parameters: z.object({
        name: z.string().optional().describe('Optional name for the session'),
        metadata: z.record(z.unknown()).optional().describe('Optional session metadata'),
      }),
      execute: async ({ name, metadata }) => {
        const session = await souvenir.createSession(name, metadata);

        return {
          success: true,
          sessionId: session.id,
          sessionName: session.sessionName,
          message: `Created session ${session.sessionName || session.id}`,
        };
      },
    }),
  };
}

/**
 * Type helper for the tools object
 */
export type SouvenirTools = ReturnType<typeof createSouvenirTools>;
