import { MemoryRepository } from '../db/repository.js';
import {
  MemoryNode,
  MemoryRelationship,
  GraphPath,
  TraversalOptions,
} from '../types.js';

/**
 * Graph operations for knowledge graph traversal
 */
export class GraphOperations {
  constructor(private repository: MemoryRepository) {}

  /**
   * Find paths between two nodes using BFS
   */
  async findPaths(
    startNodeId: string,
    endNodeId: string,
    options: TraversalOptions = {}
  ): Promise<GraphPath[]> {
    const { maxDepth = 5, relationshipTypes, nodeTypes } = options;

    const startNode = await this.repository.getNode(startNodeId);
    const endNode = await this.repository.getNode(endNodeId);

    if (!startNode || !endNode) {
      return [];
    }

    const paths: GraphPath[] = [];
    const queue: {
      currentId: string;
      path: MemoryNode[];
      relationships: MemoryRelationship[];
      depth: number;
      visited: Set<string>;
    }[] = [
      {
        currentId: startNodeId,
        path: [startNode],
        relationships: [],
        depth: 0,
        visited: new Set([startNodeId]),
      },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.currentId === endNodeId) {
        const totalWeight = current.relationships.reduce((sum, r) => sum + r.weight, 0);
        paths.push({
          nodes: current.path,
          relationships: current.relationships,
          totalWeight,
        });
        continue;
      }

      if (current.depth >= maxDepth) {
        continue;
      }

      const relationships = await this.repository.getRelationshipsForNode(
        current.currentId,
        relationshipTypes
      );

      for (const rel of relationships) {
        const nextId = rel.sourceId === current.currentId ? rel.targetId : rel.sourceId;

        if (current.visited.has(nextId)) {
          continue;
        }

        const nextNode = await this.repository.getNode(nextId);
        if (!nextNode) continue;

        if (nodeTypes && !nodeTypes.includes(nextNode.nodeType)) {
          continue;
        }

        const newVisited = new Set(current.visited);
        newVisited.add(nextId);

        queue.push({
          currentId: nextId,
          path: [...current.path, nextNode],
          relationships: [...current.relationships, rel],
          depth: current.depth + 1,
          visited: newVisited,
        });
      }
    }

    // Sort by total weight (higher is better)
    return paths.sort((a, b) => b.totalWeight - a.totalWeight);
  }

  /**
   * Get nodes within N hops of a starting node
   */
  async getNeighborhood(
    nodeId: string,
    options: TraversalOptions = {}
  ): Promise<{
    nodes: MemoryNode[];
    relationships: MemoryRelationship[];
  }> {
    const { maxDepth = 2, relationshipTypes, nodeTypes } = options;

    const nodes = new Map<string, MemoryNode>();
    const relationships = new Map<string, MemoryRelationship>();

    const startNode = await this.repository.getNode(nodeId);
    if (!startNode) {
      return { nodes: [], relationships: [] };
    }

    nodes.set(nodeId, startNode);

    const queue: { id: string; depth: number }[] = [{ id: nodeId, depth: 0 }];
    const visited = new Set<string>([nodeId]);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxDepth) {
        continue;
      }

      const rels = await this.repository.getRelationshipsForNode(
        current.id,
        relationshipTypes
      );

      for (const rel of rels) {
        relationships.set(rel.id, rel);

        const nextId = rel.sourceId === current.id ? rel.targetId : rel.sourceId;

        if (visited.has(nextId)) {
          continue;
        }

        const nextNode = await this.repository.getNode(nextId);
        if (!nextNode) continue;

        if (nodeTypes && !nodeTypes.includes(nextNode.nodeType)) {
          continue;
        }

        nodes.set(nextId, nextNode);
        visited.add(nextId);
        queue.push({ id: nextId, depth: current.depth + 1 });
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      relationships: Array.from(relationships.values()),
    };
  }

  /**
   * Find strongly connected components in the graph
   */
  async findClusters(
    sessionId?: string,
    minClusterSize: number = 3
  ): Promise<MemoryNode[][]> {
    // Get all nodes in session or all nodes
    const nodes = sessionId
      ? await this.repository.getNodesInSession(sessionId)
      : []; // TODO: implement get all nodes

    if (nodes.length === 0) {
      return [];
    }

    // Build adjacency list
    const adjacency = new Map<string, Set<string>>();
    for (const node of nodes) {
      adjacency.set(node.id, new Set());
    }

    // Get all relationships between these nodes
    const allRelationships: MemoryRelationship[] = [];
    for (const node of nodes) {
      const rels = await this.repository.getRelationshipsForNode(node.id);
      allRelationships.push(...rels);
    }

    // Build adjacency list
    for (const rel of allRelationships) {
      adjacency.get(rel.sourceId)?.add(rel.targetId);
      adjacency.get(rel.targetId)?.add(rel.sourceId);
    }

    // Find connected components using DFS
    const visited = new Set<string>();
    const clusters: MemoryNode[][] = [];

    for (const node of nodes) {
      if (visited.has(node.id)) {
        continue;
      }

      const cluster: MemoryNode[] = [];
      const stack = [node.id];

      while (stack.length > 0) {
        const currentId = stack.pop()!;

        if (visited.has(currentId)) {
          continue;
        }

        visited.add(currentId);
        const currentNode = nodes.find((n) => n.id === currentId);
        if (currentNode) {
          cluster.push(currentNode);
        }

        const neighbors = adjacency.get(currentId) || new Set();
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            stack.push(neighborId);
          }
        }
      }

      if (cluster.length >= minClusterSize) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }
}
