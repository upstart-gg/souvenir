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

        // Process in background (non-blocking for better UX)
        // Agent doesn't wait for entity extraction, embeddings, etc.
        souvenir.processAll({
          sessionId,
          generateEmbeddings: true,
          generateSummaries: true,
        }).catch((error) => {
          console.error('Background processing error:', error);
        });

        return {
          success: true,
          chunkIds,
          message: `Stored ${chunkIds.length} chunk(s), processing in background`,
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
  };
}

/**
 * Type helper for the tools object
 */
export type SouvenirTools = ReturnType<typeof createSouvenirTools>;
