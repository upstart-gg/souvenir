/**
 * Pre-made tools for Vercel AI SDK v5
 */

import { tool } from "ai";
import { z } from "zod";
import type { Souvenir } from "../core/souvenir.js";

/**
 * Create memory tools for use with Vercel AI SDK
 */
export function createSouvenirTools(souvenir: Souvenir): {
  storeMemory: unknown;
  searchMemory: unknown;
} {
  const storeMemorySchema = z.object({
    content: z.string().describe("The information to store in memory"),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Optional metadata about this memory"),
  });

  const searchMemorySchema = z.object({
    query: z.string().describe("What to search for in memory"),
    explore: z
      .boolean()
      .optional()
      .describe(
        "Whether to explore related memories in the knowledge graph (default: true)",
      ),
  });

  const storeMemoryTool = tool({
    description:
      "Store information in long-term memory for later recall. Use this to remember important facts, preferences, or context from the conversation.",
    inputSchema: storeMemorySchema,
    execute: async (params: z.infer<typeof storeMemorySchema>) => {
      const { content, metadata } = params;
      const chunkIds = await souvenir.add(content, {
        metadata,
      });

      // Process immediately for tests (synchronous)
      // In production, you might want to do this in background
      await souvenir.processAll({
        generateEmbeddings: true,
        generateSummaries: true,
      });

      return {
        success: true,
        chunkIds,
        message: `Stored ${chunkIds.length} chunk(s)`,
      };
    },
  });

  /**
   * Search memory with optional graph exploration
   * Automatically explores related memories and returns LLM-consumable context
   */
  const searchMemoryTool = tool({
    description:
      "Search long-term memory for relevant information. Automatically explores the knowledge graph to find related memories and returns context formatted for LLM consumption.",
    inputSchema: searchMemorySchema,
    execute: async (params: z.infer<typeof searchMemorySchema>) => {
      const { query, explore = true } = params;

      // Get vector search results
      const vectorResults = await souvenir.search(query, {
        limit: 5,
        strategy: "vector",
        includeRelationships: explore,
      });

      if (vectorResults.length === 0) {
        return {
          success: false,
          context: "No relevant memories found.",
          message: "No relevant memories found in the knowledge graph.",
          metadata: {
            query,
            explored: explore,
            resultCount: 0,
          },
        };
      }

      let context = "";

      if (explore) {
        // Use hybrid strategy to get richer graph structure
        const hybridResults = await souvenir.search(query, {
          limit: 5,
          strategy: "hybrid",
          includeRelationships: true,
        });

        // Format for LLM consumption with graph relationships
        context = `# Memory Search Results\n\nFound ${hybridResults.length} relevant memories:\n\n`;
        context += hybridResults
          .map((result, idx) => {
            const parts: string[] = [];
            parts.push(
              `## Memory ${idx + 1} (relevance: ${(result.score * 100).toFixed(0)}%)`,
            );
            parts.push(result.node.content);

            if (result.relationships && result.relationships.length > 0) {
              parts.push("\n**Related Concepts** (from knowledge graph):");
              result.relationships.slice(0, 3).forEach((rel) => {
                parts.push(
                  `- [${rel.relationshipType}] (strength: ${rel.weight.toFixed(2)})`,
                );
              });
              if (result.relationships.length > 3) {
                parts.push(
                  `- ... and ${result.relationships.length - 3} more connections`,
                );
              }
            }

            if (Object.keys(result.node.metadata).length > 0) {
              const metadataEntries = Object.entries(
                result.node.metadata,
              ).slice(0, 3);
              if (metadataEntries.length > 0) {
                parts.push("\n**Context**:");
                metadataEntries.forEach(([key, value]) => {
                  parts.push(`- ${key}: ${value}`);
                });
              }
            }

            return parts.join("\n");
          })
          .join("\n\n");
      } else {
        // Simple vector search results formatted for LLM
        context = `# Memory Search Results\n\nFound ${vectorResults.length} relevant memories:\n\n`;
        context += vectorResults
          .map((result, idx) => {
            const parts: string[] = [];
            parts.push(
              `## Memory ${idx + 1} (relevance: ${(result.score * 100).toFixed(0)}%)`,
            );
            parts.push(result.node.content);
            return parts.join("\n");
          })
          .join("\n\n");
      }

      return {
        success: true,
        context,
        message: `Found ${vectorResults.length} memories${explore ? " with graph exploration" : ""}`,
        metadata: {
          query,
          explored: explore,
          resultCount: vectorResults.length,
        },
      };
    },
  });

  return {
    storeMemory: storeMemoryTool,
    searchMemory: searchMemoryTool,
  };
}

/**
 * Type helper for the tools object
 */
export type SouvenirTools = ReturnType<typeof createSouvenirTools>;
