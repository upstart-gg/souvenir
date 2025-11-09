# Metadata Filtering Implementation Analysis & Improvements

## Executive Summary

Souvenir currently supports **storing** metadata on memories but lacks **filtering** capabilities during search. This document provides a deep analysis of the current implementation and proposes comprehensive improvements to enable metadata-based search filtering, allowing agents to categorize and filter memories effectively.

---

## Current State Analysis

### What Works Well

1. **Complete Metadata Storage Infrastructure**
   - JSONB columns on all tables (memory_nodes, memory_chunks, memory_relationships, memory_sessions)
   - GIN index on `memory_nodes.metadata` (db/migrations/20250106000001_create_initial_schema.sql:66)
   - Metadata flows correctly through ETL pipeline (Extract → Transform → Load)
   - Metadata displayed in search results (tools/index.ts:204-214)

2. **Metadata Flow Through ETL Pipeline**
   ```
   storeMemory(content, metadata)
     ↓
   souvenir.add(content, { metadata }) [souvenir.ts:119-180]
     ↓ Inject sessionId
   metadata = { ...userMetadata, sessionId: "uuid" }
     ↓
   createChunk(..., metadata) [repository.ts:274-292]
     ↓ Auto-processing
   processChunk() [souvenir.ts:294-400]
     ↓ Metadata inheritance
   createNode(..., { ...chunk.metadata, ... }) [repository.ts:18-42]
     ↓
   Memory stored with metadata in JSONB column
   ```

3. **Current Filtering Capabilities**
   - Session filtering (via `metadata->>'sessionId'` in repository.ts:305)
   - Node type filtering (via `nodeTypes` array in SearchOptions)
   - Relationship type filtering (via `relationshipTypes` array)
   - Relevance score filtering (via `minScore` parameter)

### Critical Gaps

1. **No Arbitrary Metadata Filtering in Search**
   - `SearchOptions` interface (types.ts:104-114) lacks metadata filter parameter
   - `searchMemory` tool (tools/index.ts:31-39) doesn't accept metadata filters
   - `vectorRetrieval()` (retrieval.ts:35-88) cannot filter by custom metadata fields
   - Repository layer has no methods for metadata-based queries

2. **Limited Metadata Query Pattern**
   - Only one JSONB query pattern in codebase: `metadata->>'sessionId'` (repository.ts:305)
   - No support for:
     - Multiple metadata field filtering
     - JSONB containment queries (`@>`)
     - JSONB existence queries (`?`)
     - Nested metadata path queries (`#>`)
     - Range queries on metadata values

3. **No Metadata-Based Result Ranking**
   - Cannot boost results based on metadata match
   - Cannot combine vector similarity + metadata relevance

---

## Proposed Improvements

### Phase 1: Core Metadata Filtering Infrastructure

#### 1.1 Extended Type Definitions

**File: src/types.ts**

Add new interfaces for metadata filtering:

```typescript
/**
 * Metadata filter operators for flexible querying
 */
export type MetadataOperator =
  | "equals"           // Field equals value
  | "not_equals"       // Field does not equal value
  | "contains"         // JSONB containment (@>)
  | "contained_by"     // JSONB contained by (<@)
  | "exists"           // Field exists (?)
  | "not_exists"       // Field does not exist
  | "in"              // Value in array
  | "not_in"          // Value not in array
  | "greater_than"    // Numeric comparison (for timestamps, numbers)
  | "less_than"       // Numeric comparison
  | "matches"         // Regex pattern matching
  ;

/**
 * Single metadata filter condition
 */
export interface MetadataFilter {
  field: string;                    // Metadata field path (e.g., "userId", "tags", "importance")
  operator: MetadataOperator;
  value: unknown;                   // Value to compare against
}

/**
 * Logical combination of metadata filters
 */
export interface MetadataFilterGroup {
  operator: "AND" | "OR";
  filters: (MetadataFilter | MetadataFilterGroup)[];
}

/**
 * Enhanced SearchOptions with metadata filtering
 */
export interface SearchOptions {
  sessionId?: string;
  nodeTypes?: string[];
  limit?: number;
  minScore?: number;
  includeRelationships?: boolean;
  relationshipTypes?: string[];
  strategy?: RetrievalStrategy;
  topK?: number;
  formatForLLM?: boolean;

  // NEW: Metadata filtering
  metadataFilters?: MetadataFilter[];           // Simple filters (AND combined)
  metadataFilterGroup?: MetadataFilterGroup;    // Complex filters (AND/OR logic)
  metadataBoost?: Record<string, number>;       // Boost scores based on metadata match
}
```

#### 1.2 Repository Layer Enhancements

**File: src/db/repository.ts**

Add metadata filtering to vector search:

```typescript
/**
 * Enhanced searchByVector with metadata filtering
 */
async searchByVector(
  embedding: number[],
  limit: number = 10,
  minScore: number = 0.7,
  nodeTypes?: string[],
  metadataFilters?: MetadataFilter[],
): Promise<SearchResult[]> {
  const embeddingArray = `[${embedding.join(",")}]`;

  // Build WHERE clause with metadata filters
  const whereConditions: string[] = [
    "embedding IS NOT NULL",
    `1 - (embedding <=> ${embeddingArray}::vector) >= ${minScore}`,
  ];

  // Add node type filtering
  if (nodeTypes && nodeTypes.length > 0) {
    whereConditions.push(`node_type = ANY(${this.db.query.json(nodeTypes)})`);
  }

  // Add metadata filters
  if (metadataFilters && metadataFilters.length > 0) {
    for (const filter of metadataFilters) {
      whereConditions.push(this.buildMetadataCondition(filter));
    }
  }

  const whereClause = whereConditions.join(" AND ");

  const rows = await this.db.query`
    SELECT *,
           1 - (embedding <=> ${embeddingArray}::vector) as score
    FROM memory_nodes
    WHERE ${whereClause}
    ORDER BY embedding <=> ${embeddingArray}::vector
    LIMIT ${limit}
  `;

  return rows.map((row: Record<string, unknown>) => ({
    node: this.mapNode(row),
    score: parseFloat(row.score as string),
  }));
}

/**
 * Build SQL condition from metadata filter
 */
private buildMetadataCondition(filter: MetadataFilter): string {
  const { field, operator, value } = filter;

  switch (operator) {
    case "equals":
      return `metadata->>'${field}' = '${this.escapeValue(value)}'`;

    case "not_equals":
      return `metadata->>'${field}' != '${this.escapeValue(value)}'`;

    case "contains":
      // JSONB containment: does metadata contain this key-value pair?
      return `metadata @> '{"${field}": ${JSON.stringify(value)}}'::jsonb`;

    case "exists":
      // Check if field exists
      return `metadata ? '${field}'`;

    case "not_exists":
      return `NOT (metadata ? '${field}')`;

    case "in":
      if (!Array.isArray(value)) throw new Error("'in' operator requires array value");
      const inValues = value.map(v => `'${this.escapeValue(v)}'`).join(", ");
      return `metadata->>'${field}' IN (${inValues})`;

    case "not_in":
      if (!Array.isArray(value)) throw new Error("'not_in' operator requires array value");
      const notInValues = value.map(v => `'${this.escapeValue(v)}'`).join(", ");
      return `metadata->>'${field}' NOT IN (${notInValues})`;

    case "greater_than":
      return `(metadata->>'${field}')::numeric > ${value}`;

    case "less_than":
      return `(metadata->>'${field}')::numeric < ${value}`;

    case "matches":
      return `metadata->>'${field}' ~ '${this.escapeValue(value)}'`;

    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

/**
 * Escape value for SQL injection prevention
 */
private escapeValue(value: unknown): string {
  if (typeof value === "string") {
    return value.replace(/'/g, "''");
  }
  return String(value);
}

/**
 * Get nodes by metadata filter (useful for debugging/management)
 */
async getNodesByMetadata(
  filters: MetadataFilter[],
  limit: number = 100,
): Promise<MemoryNode[]> {
  const whereConditions = filters.map(f => this.buildMetadataCondition(f));
  const whereClause = whereConditions.join(" AND ");

  const rows = await this.db.query`
    SELECT * FROM memory_nodes
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row: Record<string, unknown>) => this.mapNode(row));
}
```

#### 1.3 Retrieval Strategy Enhancements

**File: src/core/retrieval.ts**

Update retrieval strategies to support metadata filtering:

```typescript
/**
 * Enhanced vector retrieval with metadata filtering
 */
async vectorRetrieval(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  if (!this.embedding) {
    throw new Error("Embedding provider required for vector retrieval");
  }

  const {
    limit = 10,
    minScore = 0.7,
    nodeTypes,
    sessionId,
    includeRelationships = false,
    relationshipTypes,
    metadataFilters,        // NEW
    metadataBoost,          // NEW
  } = options;

  // Generate query embedding
  const queryEmbedding = await this.embedding.embed(query);

  // Search with metadata filters
  let results = await this.repository.searchByVector(
    queryEmbedding,
    limit * 2,
    minScore,
    nodeTypes,
    metadataFilters,       // Pass metadata filters
  );

  // Session filtering (existing)
  if (sessionId) {
    const sessionNodes = await this.repository.getNodesInSession(sessionId);
    const sessionNodeIds = new Set(sessionNodes.map((n) => n.id));
    results = results.filter((r) => sessionNodeIds.has(r.node.id));
  }

  // NEW: Apply metadata-based score boosting
  if (metadataBoost) {
    results = results.map(result => ({
      ...result,
      score: this.applyMetadataBoost(result, metadataBoost),
    }));

    // Re-sort by boosted scores
    results.sort((a, b) => b.score - a.score);
  }

  // Limit results
  results = results.slice(0, limit);

  // Include relationships if requested
  if (includeRelationships) {
    for (const result of results) {
      result.relationships = await this.repository.getRelationshipsForNode(
        result.node.id,
        relationshipTypes,
      );
    }
  }

  return results;
}

/**
 * Apply score boost based on metadata matches
 */
private applyMetadataBoost(
  result: SearchResult,
  boostConfig: Record<string, number>,
): number {
  let boostedScore = result.score;

  for (const [metadataField, boostFactor] of Object.entries(boostConfig)) {
    // Check if metadata field exists and has a value
    if (result.node.metadata[metadataField]) {
      // Apply boost (multiplicative)
      boostedScore *= (1 + boostFactor);
    }
  }

  // Ensure score stays within [0, 1] range
  return Math.min(boostedScore, 1.0);
}
```

### Phase 2: Tool API Enhancements

#### 2.1 Enhanced searchMemory Tool

**File: src/tools/index.ts**

Add metadata filtering to the searchMemory tool:

```typescript
const searchMemorySchema = z.object({
  query: z.string().describe("What to search for in memory"),
  explore: z
    .boolean()
    .optional()
    .describe("Whether to explore related memories in the knowledge graph (default: true)"),

  // NEW: Metadata filtering parameters
  metadataFilters: z
    .array(z.object({
      field: z.string().describe("Metadata field name (e.g., 'userId', 'category', 'importance')"),
      operator: z.enum([
        "equals", "not_equals", "contains", "exists", "not_exists",
        "in", "not_in", "greater_than", "less_than", "matches"
      ]).describe("Comparison operator"),
      value: z.unknown().describe("Value to compare against"),
    }))
    .optional()
    .describe("Filter results by metadata fields. All filters are AND-combined."),

  nodeTypes: z
    .array(z.string())
    .optional()
    .describe("Filter by node types (e.g., ['entity', 'chunk', 'person'])"),

  limit: z
    .number()
    .optional()
    .describe("Maximum number of results to return (default: 5)"),
});

const searchMemoryTool = tool({
  description:
    "Search long-term memory for relevant information with optional metadata filtering. " +
    "Filter by categories, users, importance levels, or any custom metadata fields. " +
    "Automatically explores the knowledge graph to find related memories.",
  inputSchema: searchMemorySchema,
  execute: async (params: z.infer<typeof searchMemorySchema>) => {
    const {
      query,
      explore = true,
      metadataFilters,
      nodeTypes,
      limit = 5,
    } = params;

    // Build search options with metadata filters
    const searchOptions: SearchOptions = {
      limit,
      strategy: "vector",
      includeRelationships: explore,
      nodeTypes,
      metadataFilters,  // Pass metadata filters
    };

    // Execute search with metadata filtering
    let vectorResults = await souvenir.search(query, searchOptions);

    // Adaptive fallback (same as before)
    if (vectorResults.length === 0) {
      const broadened = await souvenir.search(query, {
        ...searchOptions,
        minScore: 0,
      });

      if (broadened.length > 0) {
        vectorResults = broadened;
      } else {
        // Keyword fallback (existing implementation)
        // ...
      }
    }

    // Format results (existing implementation with metadata display)
    let memory = "";

    if (explore) {
      const hybridResults = await souvenir.search(query, {
        ...searchOptions,
        strategy: "hybrid",
        includeRelationships: true,
      });

      const toFormat = hybridResults.length > 0 ? hybridResults : vectorResults;

      memory = `# Memory Search Results\n\nFound ${toFormat.length} relevant memories`;

      // Show active filters in output
      if (metadataFilters && metadataFilters.length > 0) {
        memory += ` (filtered by: ${metadataFilters.map(f => f.field).join(", ")})`;
      }

      memory += ":\n\n";

      // Format each result with metadata highlighted
      memory += toFormat.map((result, idx) => {
        const parts: string[] = [];
        parts.push(`## Memory ${idx + 1} (relevance: ${(result.score * 100).toFixed(0)}%)`);
        parts.push(`<memory-node id="${result.node.id}" />`);
        parts.push(result.node.content);

        if (result.relationships && result.relationships.length > 0) {
          parts.push("\n**Related Concepts** (from knowledge graph):");
          result.relationships.slice(0, 3).forEach((rel) => {
            parts.push(`- [${rel.relationshipType}] (strength: ${rel.weight.toFixed(2)})`);
          });
        }

        // Highlight filtered metadata fields
        if (Object.keys(result.node.metadata).length > 0) {
          const metadataEntries = Object.entries(result.node.metadata);

          // Prioritize filtered fields
          const filteredFields = new Set(metadataFilters?.map(f => f.field) || []);
          const prioritized = metadataEntries.sort(([keyA], [keyB]) => {
            const aFiltered = filteredFields.has(keyA);
            const bFiltered = filteredFields.has(keyB);
            if (aFiltered && !bFiltered) return -1;
            if (!aFiltered && bFiltered) return 1;
            return 0;
          });

          const toDisplay = prioritized.slice(0, 5);
          if (toDisplay.length > 0) {
            parts.push("\n**Context**:");
            toDisplay.forEach(([key, value]) => {
              const marker = filteredFields.has(key) ? "✓ " : "";
              parts.push(`- ${marker}${key}: ${value}`);
            });
          }
        }

        return parts.join("\n");
      }).join("\n\n");
    }

    return {
      success: true,
      memory,
      message: `Found ${vectorResults.length} memories${metadataFilters ? " with metadata filtering" : ""}${explore ? " with graph exploration" : ""}`,
      metadata: {
        query,
        explored: explore,
        resultCount: vectorResults.length,
        filtersApplied: metadataFilters?.length || 0,
      },
    };
  },
});
```

### Phase 3: Advanced Features

#### 3.1 Metadata-Based Memory Management

Add utility methods to Souvenir class for metadata management:

**File: src/core/souvenir.ts**

```typescript
/**
 * Get all unique metadata keys used in session
 */
async getMetadataKeys(sessionId?: string): Promise<string[]> {
  const sid = sessionId || this.sessionId;
  const nodes = await this.repository.getNodesInSession(sid);

  const keysSet = new Set<string>();
  for (const node of nodes) {
    Object.keys(node.metadata).forEach(key => keysSet.add(key));
  }

  return Array.from(keysSet).sort();
}

/**
 * Get metadata value distribution for a field
 */
async getMetadataValueDistribution(
  field: string,
  sessionId?: string,
): Promise<Record<string, number>> {
  const sid = sessionId || this.sessionId;
  const nodes = await this.repository.getNodesInSession(sid);

  const distribution: Record<string, number> = {};

  for (const node of nodes) {
    const value = node.metadata[field];
    if (value !== undefined) {
      const key = String(value);
      distribution[key] = (distribution[key] || 0) + 1;
    }
  }

  return distribution;
}

/**
 * Update metadata for existing nodes
 */
async updateNodeMetadata(
  nodeId: string,
  metadataUpdates: Record<string, unknown>,
  merge: boolean = true,
): Promise<MemoryNode | null> {
  const node = await this.repository.getNode(nodeId);
  if (!node) return null;

  const newMetadata = merge
    ? { ...node.metadata, ...metadataUpdates }
    : metadataUpdates;

  return this.repository.updateNode(this.sessionId, nodeId, {
    metadata: newMetadata,
  });
}

/**
 * Bulk metadata update for multiple nodes
 */
async bulkUpdateMetadata(
  filters: MetadataFilter[],
  metadataUpdates: Record<string, unknown>,
): Promise<number> {
  const nodes = await this.repository.getNodesByMetadata(filters);

  let updated = 0;
  for (const node of nodes) {
    const result = await this.updateNodeMetadata(
      node.id,
      metadataUpdates,
      true,
    );
    if (result) updated++;
  }

  return updated;
}
```

#### 3.2 Database Optimization

**File: db/migrations/20250109000001_add_metadata_indexes.sql**

Create additional indexes for common metadata query patterns:

```sql
-- Add GIN indexes for JSONB containment queries on other tables
CREATE INDEX IF NOT EXISTS idx_memory_chunks_metadata
  ON memory_chunks USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_memory_relationships_metadata
  ON memory_relationships USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_memory_sessions_metadata
  ON memory_sessions USING GIN (metadata);

-- Add indexes for common metadata field patterns
-- (Only if you have known common fields - otherwise GIN index is sufficient)

-- Example: If userId is frequently queried
CREATE INDEX IF NOT EXISTS idx_memory_nodes_metadata_user_id
  ON memory_nodes ((metadata->>'userId'));

-- Example: If importance is frequently used for filtering
CREATE INDEX IF NOT EXISTS idx_memory_nodes_metadata_importance
  ON memory_nodes (((metadata->>'importance')::numeric));

-- Example: If timestamp-based queries are common
CREATE INDEX IF NOT EXISTS idx_memory_nodes_metadata_timestamp
  ON memory_nodes (((metadata->>'timestamp')::timestamp));

-- Composite index for session + metadata filtering
CREATE INDEX IF NOT EXISTS idx_session_nodes_composite
  ON session_nodes (session_id, added_at DESC);
```

---

## Example Use Cases

### Use Case 1: Multi-User Agent System

```typescript
// Store memories with user context
await storeMemory({
  content: "User Alice prefers dark mode",
  metadata: {
    userId: "alice",
    category: "preference",
    importance: 8,
  },
});

await storeMemory({
  content: "User Bob's favorite programming language is Python",
  metadata: {
    userId: "bob",
    category: "preference",
    importance: 7,
  },
});

// Search only Alice's memories
const aliceMemories = await searchMemory({
  query: "user preferences",
  metadataFilters: [
    { field: "userId", operator: "equals", value: "alice" },
  ],
});

// Search high-importance memories across all users
const importantMemories = await searchMemory({
  query: "preferences",
  metadataFilters: [
    { field: "importance", operator: "greater_than", value: 7 },
  ],
});
```

### Use Case 2: Project-Scoped Memories

```typescript
// Store project-specific context
await storeMemory({
  content: "The authentication service uses OAuth2",
  metadata: {
    project: "api-backend",
    component: "auth",
    layer: "service",
  },
});

await storeMemory({
  content: "React components are in src/components/",
  metadata: {
    project: "web-frontend",
    component: "ui",
    layer: "view",
  },
});

// Search only backend project memories
const backendMemories = await searchMemory({
  query: "authentication",
  metadataFilters: [
    { field: "project", operator: "equals", value: "api-backend" },
  ],
});

// Search service layer across all projects
const serviceMemories = await searchMemory({
  query: "architecture",
  metadataFilters: [
    { field: "layer", operator: "equals", value: "service" },
  ],
});
```

### Use Case 3: Temporal Filtering

```typescript
// Store time-sensitive information
await storeMemory({
  content: "Deployed version 2.1.0 to production",
  metadata: {
    type: "deployment",
    version: "2.1.0",
    timestamp: new Date().toISOString(),
    environment: "production",
  },
});

// Find recent deployments
const recentDeployments = await searchMemory({
  query: "deployment",
  metadataFilters: [
    {
      field: "timestamp",
      operator: "greater_than",
      value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { field: "type", operator: "equals", value: "deployment" },
  ],
});
```

### Use Case 4: Tag-Based Categorization

```typescript
// Store with multiple tags
await storeMemory({
  content: "Implemented binary search algorithm for user lookup",
  metadata: {
    tags: ["algorithm", "search", "optimization"],
    language: "TypeScript",
    difficulty: "intermediate",
  },
});

// Search by tag (using JSONB containment)
const algorithmMemories = await searchMemory({
  query: "implementation",
  metadataFilters: [
    {
      field: "tags",
      operator: "contains",
      value: "algorithm",  // JSONB array contains
    },
  ],
});

// Search by multiple tags (AND logic)
const searchOptMemories = await searchMemory({
  query: "code",
  metadataFilters: [
    { field: "tags", operator: "contains", value: "search" },
    { field: "tags", operator: "contains", value: "optimization" },
  ],
});
```

### Use Case 5: Agent Role-Based Memory

```typescript
// Different agent roles store different types of memories
await storeMemory({
  content: "Security vulnerability found in input validation",
  metadata: {
    agentRole: "security-scanner",
    severity: "high",
    resolved: false,
  },
});

await storeMemory({
  content: "Performance test shows 200ms average response time",
  metadata: {
    agentRole: "performance-tester",
    metric: "response_time",
    value: 200,
    unit: "ms",
  },
});

// Security agent searches only security-related memories
const securityIssues = await searchMemory({
  query: "vulnerabilities",
  metadataFilters: [
    { field: "agentRole", operator: "equals", value: "security-scanner" },
    { field: "resolved", operator: "equals", value: false },
  ],
});
```

---

## Implementation Checklist

### Priority 1: Core Functionality (Must Have)

- [ ] Add `MetadataFilter` and related types to `src/types.ts`
- [ ] Extend `SearchOptions` interface with `metadataFilters` field
- [ ] Implement `buildMetadataCondition()` in `MemoryRepository`
- [ ] Update `searchByVector()` to accept and apply metadata filters
- [ ] Update `vectorRetrieval()` in `RetrievalStrategies` to pass metadata filters
- [ ] Extend `searchMemory` tool schema to accept metadata filters
- [ ] Update `searchMemory` tool execution to use metadata filters
- [ ] Add tests for basic metadata filtering (equals, exists, in operators)

### Priority 2: Advanced Filtering (Should Have)

- [ ] Implement `MetadataFilterGroup` for AND/OR logic
- [ ] Add support for all metadata operators (contains, not_equals, matches, etc.)
- [ ] Implement `getNodesByMetadata()` repository method
- [ ] Add metadata-based score boosting in retrieval
- [ ] Create database migration for additional metadata indexes
- [ ] Add tests for complex filter combinations

### Priority 3: Management Features (Nice to Have)

- [ ] Add `getMetadataKeys()` to Souvenir class
- [ ] Add `getMetadataValueDistribution()` to Souvenir class
- [ ] Add `updateNodeMetadata()` method
- [ ] Add `bulkUpdateMetadata()` method
- [ ] Create metadata management tool for agents
- [ ] Add documentation for metadata filtering patterns

### Priority 4: Performance & Optimization (Future)

- [ ] Benchmark metadata queries with large datasets
- [ ] Add query plan analysis for metadata filters
- [ ] Implement metadata filter caching
- [ ] Add metadata field validation/schema enforcement
- [ ] Create composite indexes for common filter patterns
- [ ] Add metrics/telemetry for metadata filter usage

---

## Backward Compatibility

All proposed changes are **fully backward compatible**:

1. **Optional Parameters**: All new fields (`metadataFilters`, `metadataBoost`) are optional
2. **Default Behavior**: Existing code without metadata filters works identically
3. **Existing Schemas**: JSONB metadata columns already exist in database
4. **No Breaking Changes**: No changes to existing method signatures (only additions)

**Migration Path**:
1. Deploy code changes (backward compatible)
2. Run database migration for new indexes (non-blocking)
3. Update agent implementations to use metadata filtering (gradual rollout)

---

## Performance Considerations

### Database Query Performance

1. **GIN Index Efficiency**
   - GIN indexes on JSONB columns provide O(log n) lookup for containment queries
   - Effective for `@>`, `?`, and `?&` operators
   - Less effective for `->>` text extraction (consider dedicated indexes)

2. **Index Recommendations**
   ```sql
   -- Good: Uses GIN index
   WHERE metadata @> '{"userId": "alice"}'

   -- Slower: Text extraction (consider dedicated index)
   WHERE metadata->>'userId' = 'alice'

   -- Faster with dedicated index:
   CREATE INDEX idx_user_id ON memory_nodes ((metadata->>'userId'));
   ```

3. **Query Optimization**
   - Limit metadata filters to 3-5 conditions for best performance
   - Use `nodeTypes` filter first (smaller result set)
   - Apply metadata filters before vector similarity (reduce embedding comparisons)

### Memory Usage

1. **JSONB Storage**
   - JSONB is stored in binary format (more efficient than JSON)
   - Typical metadata object: 100-500 bytes
   - 1M nodes with metadata: ~100-500 MB additional storage

2. **Index Overhead**
   - GIN index: ~2x the size of the indexed data
   - Dedicated field indexes: minimal overhead

---

## Testing Strategy

### Unit Tests

```typescript
// Test basic metadata filtering
describe("Metadata Filtering", () => {
  test("should filter by exact match", async () => {
    await souvenir.add("Memory 1", { metadata: { userId: "alice" } });
    await souvenir.add("Memory 2", { metadata: { userId: "bob" } });

    const results = await souvenir.search("memory", {
      metadataFilters: [
        { field: "userId", operator: "equals", value: "alice" },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0].node.metadata.userId).toBe("alice");
  });

  test("should filter by multiple conditions (AND)", async () => {
    await souvenir.add("Memory 1", {
      metadata: { userId: "alice", importance: 8 }
    });
    await souvenir.add("Memory 2", {
      metadata: { userId: "alice", importance: 5 }
    });

    const results = await souvenir.search("memory", {
      metadataFilters: [
        { field: "userId", operator: "equals", value: "alice" },
        { field: "importance", operator: "greater_than", value: 7 },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0].node.metadata.importance).toBe(8);
  });
});
```

### Integration Tests

```typescript
// Test with searchMemory tool
describe("searchMemory Tool with Metadata", () => {
  test("should filter search results by metadata", async () => {
    const tools = createSouvenirTools(souvenir);

    await tools.storeMemory.execute({
      content: "Alice likes TypeScript",
      metadata: { user: "alice", topic: "preferences" },
    });

    await tools.storeMemory.execute({
      content: "Bob likes Python",
      metadata: { user: "bob", topic: "preferences" },
    });

    const result = await tools.searchMemory.execute({
      query: "programming preferences",
      metadataFilters: [
        { field: "user", operator: "equals", value: "alice" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.memory).toContain("TypeScript");
    expect(result.memory).not.toContain("Python");
  });
});
```

---

## Documentation Updates Needed

1. **README.md**: Add metadata filtering examples
2. **API Reference**: Document `metadataFilters` parameter
3. **Migration Guide**: How to add metadata to existing memories
4. **Best Practices**: Metadata naming conventions, common patterns
5. **Performance Guide**: When to use metadata filters vs. other strategies

---

## Conclusion

This implementation provides a comprehensive, performant, and flexible metadata filtering system for Souvenir that:

1. **Enables rich categorization** - Agents can organize memories by user, project, category, importance, tags, etc.
2. **Maintains backward compatibility** - All changes are optional and additive
3. **Leverages existing infrastructure** - Uses JSONB columns and GIN indexes already in place
4. **Provides multiple filtering patterns** - From simple equality to complex AND/OR logic
5. **Scales efficiently** - Proper indexing and query optimization strategies
6. **Integrates seamlessly** - Works with existing retrieval strategies and tools

The phased implementation approach allows for gradual rollout, starting with core functionality and expanding to advanced features based on usage patterns and feedback.
