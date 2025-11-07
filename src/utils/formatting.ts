/**
 * Context formatting utilities for LLM consumption
 * Based on Cognee paper's approach to formatting graph triplets
 */

import type {
  MemoryNode,
  MemoryRelationship,
  FormattedContext,
  SearchResult,
  GraphRetrievalResult,
} from '../types.js';

/**
 * Format search results as text context for LLM
 */
export function formatSearchResultsForLLM(results: SearchResult[]): FormattedContext {
  if (results.length === 0) {
    return {
      type: 'text',
      content: 'No relevant context found.',
      sources: [],
    };
  }

  const contentParts: string[] = [];
  const sources = results.map((r) => ({ nodeId: r.node.id, score: r.score }));

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    contentParts.push(`[${i + 1}] ${result.node.content}`);

    // Add metadata if available
    if (Object.keys(result.node.metadata).length > 0) {
      const metadataStr = Object.entries(result.node.metadata)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      contentParts.push(`   Metadata: ${metadataStr}`);
    }
  }

  return {
    type: 'text',
    content: contentParts.join('\n\n'),
    sources,
  };
}

/**
 * Format graph triplets for LLM
 * Paper: "Retrieved nodes are briefly described, and surrounding triplets are formatted as structured text"
 */
export function formatGraphTripletsForLLM(
  node: MemoryNode,
  relationships: MemoryRelationship[],
  allNodes: Map<string, MemoryNode>
): string {
  const parts: string[] = [];

  // Node description
  parts.push(`**Node**: ${node.content}`);
  if (node.nodeType !== 'chunk') {
    parts.push(`**Type**: ${node.nodeType}`);
  }

  // Group relationships by type
  const groupedRels = new Map<string, Array<{ target: MemoryNode; weight: number }>>();

  for (const rel of relationships) {
    const targetId = rel.sourceId === node.id ? rel.targetId : rel.sourceId;
    const targetNode = allNodes.get(targetId);

    if (targetNode) {
      if (!groupedRels.has(rel.relationshipType)) {
        groupedRels.set(rel.relationshipType, []);
      }
      groupedRels.get(rel.relationshipType)!.push({
        target: targetNode,
        weight: rel.weight,
      });
    }
  }

  // Format relationships by type
  if (groupedRels.size > 0) {
    parts.push('\n**Relationships**:');
    for (const [relType, targets] of groupedRels) {
      parts.push(`  ${relType}:`);
      for (const { target, weight } of targets) {
        const truncated =
          target.content.length > 100
            ? target.content.slice(0, 100) + '...'
            : target.content;
        parts.push(`    - ${truncated} (weight: ${weight.toFixed(2)})`);
      }
    }
  }

  return parts.join('\n');
}

/**
 * Format graph retrieval results for LLM
 */
export function formatGraphRetrievalForLLM(
  results: GraphRetrievalResult[]
): FormattedContext {
  if (results.length === 0) {
    return {
      type: 'graph',
      content: 'No relevant graph context found.',
      sources: [],
    };
  }

  const contentParts: string[] = [];
  const sources = results.map((r) => ({ nodeId: r.node.id, score: r.score }));

  contentParts.push('# Knowledge Graph Context\n');

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    contentParts.push(`## Result ${i + 1} (relevance: ${result.score.toFixed(3)})\n`);

    if (result.formattedTriplets) {
      contentParts.push(result.formattedTriplets);
    } else {
      // Fallback formatting
      const allNodes = new Map<string, MemoryNode>();
      allNodes.set(result.node.id, result.node);
      for (const n of result.neighborhood.nodes) {
        allNodes.set(n.id, n);
      }

      const formatted = formatGraphTripletsForLLM(
        result.node,
        result.neighborhood.relationships,
        allNodes
      );
      contentParts.push(formatted);
    }

    contentParts.push(''); // Empty line between results
  }

  return {
    type: 'graph',
    content: contentParts.join('\n'),
    sources,
  };
}

/**
 * Format hybrid context (text + graph) for LLM
 */
export function formatHybridContextForLLM(
  textResults: SearchResult[],
  graphResults: GraphRetrievalResult[]
): FormattedContext {
  const parts: string[] = [];
  const sources: { nodeId: string; score: number }[] = [];

  if (textResults.length > 0) {
    parts.push('# Text Context\n');
    const textCtx = formatSearchResultsForLLM(textResults);
    parts.push(textCtx.content);
    sources.push(...textCtx.sources);
  }

  if (graphResults.length > 0) {
    if (parts.length > 0) {
      parts.push('\n---\n');
    }
    const graphCtx = formatGraphRetrievalForLLM(graphResults);
    parts.push(graphCtx.content);
    sources.push(...graphCtx.sources);
  }

  return {
    type: 'hybrid',
    content: parts.join('\n'),
    sources,
    metadata: {
      textResultCount: textResults.length,
      graphResultCount: graphResults.length,
    },
  };
}

/**
 * Format summary nodes for retrieval
 */
export function formatSummaryForLLM(summaryNode: MemoryNode): string {
  const parts: string[] = [];

  parts.push('**Summary**:');
  parts.push(summaryNode.content);

  if (summaryNode.metadata.sourceIds) {
    const sourceCount = (summaryNode.metadata.sourceIds as string[]).length;
    parts.push(`\n(Summarizes ${sourceCount} memory node(s))`);
  }

  return parts.join('\n');
}
