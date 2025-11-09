/**
 * Pre-made tools for Vercel AI SDK v5
 */

import { tool } from "ai";
import { z } from "zod";
import type { Souvenir } from "../core/souvenir.ts";

/**
 * Create memory tools for use with Vercel AI SDK
 */
export function createSouvenirTools(souvenir: Souvenir): {
  storeMemory: unknown;
  searchMemory: unknown;
  deleteMemory: unknown;
} {
  const storeMemorySchema = z.object({
    content: z.string().describe("The information to store in memory"),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Optional metadata about this memory. Use 'category' field to enable filtering (e.g., {category: 'preference'})",
      ),
    processImmediately: z
      .boolean()
      .optional()
      .describe(
        "Force immediate processing instead of batched processing (default: false)",
      ),
  });

  const searchMemorySchema = z.object({
    query: z.string().describe("What to search for in memory"),
    explore: z
      .boolean()
      .optional()
      .describe(
        "Whether to explore related memories in the knowledge graph (default: true)",
      ),
    category: z
      .string()
      .optional()
      .describe(
        "Filter results by memory category (e.g., 'preference', 'configuration', 'task')",
      ),
  });

  const deleteMemorySchema = z.object({
    nodeIds: z
      .array(z.string())
      .describe(
        'Array of memory node IDs to delete. Node IDs can be extracted from search results using the <memory-node id="..."/> tags.',
      ),
  });

  const storeMemoryTool = tool({
    description:
      "Store information in long-term memory for later recall. Use this to remember important facts, preferences, or context from the conversation. Memory processing is batched automatically for efficiency.",
    inputSchema: storeMemorySchema,
    execute: async (params: z.infer<typeof storeMemorySchema>) => {
      const { content, metadata, processImmediately = false } = params;
      const chunkIds = await souvenir.add(content, {
        metadata,
      });

      // Force immediate processing if requested (e.g., for tests or critical data)
      if (processImmediately) {
        await souvenir.forceMemoryProcessing({
          generateEmbeddings: true,
          generateSummaries: false,
        });
        return {
          success: true,
          chunkIds,
          message: `Stored and processed ${chunkIds.length} chunk(s) immediately`,
        };
      }

      // Otherwise, processing will happen automatically via debounced batch processing
      return {
        success: true,
        chunkIds,
        message: `Stored ${chunkIds.length} chunk(s) (processing scheduled)`,
      };
    },
  });

  /**
   * Search memory with optional graph exploration
   * Automatically explores related memories and returns LLM-consumable context
   */
  const searchMemoryTool = tool({
    description:
      "Search long-term memory for relevant information. Automatically explores the knowledge graph to find related memories and returns context formatted for LLM consumption. Always scoped to current session.",
    inputSchema: searchMemorySchema,
    execute: async (params: z.infer<typeof searchMemorySchema>) => {
      const { query, explore = true, category } = params;

      // Get vector search results (always scoped to current session)
      let vectorResults = await souvenir.search(query, {
        sessionId: souvenir.getSessionId(),
        limit: 5,
        strategy: "vector",
        includeRelationships: explore,
        category,
      });

      // Adaptive fallback: if no results at configured threshold, retry with minScore=0
      if (vectorResults.length === 0) {
        const broadened = await souvenir.search(query, {
          sessionId: souvenir.getSessionId(),
          limit: 5,
          strategy: "vector",
          includeRelationships: explore,
          minScore: 0, // widest possible recall
          category,
        });
        if (broadened.length > 0) {
          vectorResults = broadened;
        } else {
          // Keyword fallback within current session when vector search yields nothing
          try {
            const sessionNodes = await souvenir.getNodesInSession(
              souvenir.getSessionId(),
            );
            const q = query.toLowerCase();
            const queryTokens = q
              .split(/\s+/)
              .map((t) => t.trim())
              .filter((t) => t.length > 2);
            let keywordMatches = sessionNodes.filter((n) => {
              const contentLower = n.content.toLowerCase();
              return queryTokens.some((t) => contentLower.includes(t));
            });

            // Apply category filtering if provided
            if (category) {
              keywordMatches = keywordMatches.filter(
                (n) => n.metadata.category === category,
              );
            }

            if (keywordMatches.length > 0) {
              // Build minimal memory from keyword matches
              const header = `# Memory Search Results\n\nFound ${keywordMatches.length} relevant memories:\n\n`;
              const body = keywordMatches
                .slice(0, 5)
                .map(
                  (n, idx) =>
                    `## Memory ${idx + 1} (relevance: 0%)\n\n<memory-node id="${n.id}" />\n\n${n.content}`,
                )
                .join("\n\n");
              return {
                success: true,
                memory: header + body,
                message: `Found ${keywordMatches.length} memories (keyword fallback)`,
                metadata: {
                  query,
                  explored: explore,
                  resultCount: keywordMatches.length,
                },
              };
            }
          } catch {
            // ignore fallback errors and return empty
          }

          // Provide structured empty memory matching test expectations while signaling no results
          const emptyMemory = `# Memory Search Results\n\nFound 0 relevant memories:\n\nNo relevant memories found.`;
          return {
            success: false,
            memory: emptyMemory,
            message: "No relevant memories found in the knowledge graph.",
            metadata: {
              query,
              explored: explore,
              resultCount: 0,
            },
          };
        }
      }

      let memory = "";

      if (explore) {
        // Use hybrid strategy to get richer graph structure
        const hybridResults = await souvenir.search(query, {
          sessionId: souvenir.getSessionId(),
          limit: 5,
          strategy: "hybrid",
          includeRelationships: true,
          category,
        });

        // If hybrid yielded nothing but vector did, fall back to vector results while preserving metadata formatting
        const toFormat =
          hybridResults.length > 0 ? hybridResults : vectorResults;

        // Format for LLM consumption with graph relationships (if available)
        memory = `# Memory Search Results\n\nFound ${toFormat.length} relevant memories:\n\n`;
        memory += toFormat
          .map((result, idx) => {
            const parts: string[] = [];
            parts.push(
              `## Memory ${idx + 1} (relevance: ${(result.score * 100).toFixed(0)}%)`,
            );
            parts.push(`<memory-node id="${result.node.id}" />`);
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
        memory = `# Memory Search Results\n\nFound ${vectorResults.length} relevant memories:\n\n`;
        memory += vectorResults
          .map((result, idx) => {
            const parts: string[] = [];
            parts.push(
              `## Memory ${idx + 1} (relevance: ${(result.score * 100).toFixed(0)}%)`,
            );
            parts.push(`<memory-node id="${result.node.id}" />`);
            parts.push(result.node.content);
            return parts.join("\n");
          })
          .join("\n\n");
      }

      return {
        success: true,
        memory,
        message: `Found ${vectorResults.length} memories${explore ? " with graph exploration" : ""}`,
        metadata: {
          query,
          explored: explore,
          resultCount: vectorResults.length,
        },
      };
    },
  });

  /**
   * Delete memories by their node IDs
   * Node IDs can be extracted from searchMemory results using the <memory-node id="..."/> tags
   */
  const deleteMemoryTool = tool({
    description:
      'Delete specific memories from long-term storage using their node IDs. Node IDs can be found in search results within the <memory-node id="..."/> tags. Use this to remove outdated, incorrect, or irrelevant information.',
    inputSchema: deleteMemorySchema,
    execute: async (params: z.infer<typeof deleteMemorySchema>) => {
      const { nodeIds } = params;

      if (nodeIds.length === 0) {
        return {
          success: false,
          deletedCount: 0,
          message: "No node IDs provided",
        };
      }

      try {
        await souvenir.deleteNodes(nodeIds);
        return {
          success: true,
          deletedCount: nodeIds.length,
          message: `Deleted ${nodeIds.length} memory node(s)`,
        };
      } catch (error) {
        return {
          success: false,
          deletedCount: 0,
          message: `Failed to delete memories: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

  return {
    storeMemory: storeMemoryTool,
    searchMemory: searchMemoryTool,
    deleteMemory: deleteMemoryTool,
  };
}

/**
 * Type helper for the tools object
 */
export type SouvenirTools = ReturnType<typeof createSouvenirTools>;
