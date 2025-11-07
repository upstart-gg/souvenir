# API Reference

Souvenir provides a simple API focused on tools for Vercel AI SDK agents.

## Memory Tools (Main API)

The primary way to use Souvenir is through the memory tools:

### Memory Tools

Pre-built tools for Vercel AI SDK agents that handle all memory operations automatically:

```typescript
import { createSouvenirTools } from '@upstart.gg/souvenir/tools';

const tools = createSouvenirTools(souvenir);

// Use in your agent
await generateText({
  model: openai('gpt-4'),
  tools, // Provides: storeMemory, searchMemory
  messages: [...]
});
```

**Available tools:**
- `storeMemory` - Store important information in memory
- `searchMemory` - Search past memories with configurable retrieval strategies

### storeMemory

Store information in long-term memory for later recall.

**Parameters:**
- `content` (string) - The information to store in memory
- `metadata` (object, optional) - Additional context or tags

**Returns:**
```typescript
{
  success: boolean;
  chunkIds: string[];
  message: string;
}
```

### searchMemory

Search long-term memory for relevant information.

**Parameters:**
- `query` (string) - What to search for
- `explore` (boolean, optional, default: true) - Explore knowledge graph

**Returns:**
```typescript
{
  success: boolean;
  context: string;        // LLM-consumable formatted results
  message: string;
  metadata: {
    query: string;
    explored: boolean;
    resultCount: number;
  };
}
```

---

## Configuration

See the [Quick Start Guide](/guide/quick-start) for complete configuration options.

### Basic Setup

```typescript
const souvenir = new Souvenir(
  {
    databaseUrl: string;              // PostgreSQL connection
    embeddingDimensions?: number;     // Default: 1536
    chunkSize?: number;               // Default: 1000
    chunkOverlap?: number;            // Default: 200
    minRelevanceScore?: number;       // Default: 0.7
    maxResults?: number;              // Default: 10
  },
  {
    sessionId: string;                // Required: session identifier
    embeddingProvider: EmbeddingProvider; // Required: embedding model
    processorModel?: LanguageModel;   // Optional: entity extraction LLM
    promptTemplates?: PromptTemplates; // Optional: custom prompts
  }
);
```

---

## Core Methods (Advanced)

For advanced use cases, the following methods are available:

### search(query, options?)
Low-level search with strategy selection.

### getNeighborhood(nodeId, options?)
Get nodes connected to a specific memory node.

### findPaths(startNodeId, endNodeId, options?)
Find connection paths between two memories.

### findClusters(sessionId?, minClusterSize?)
Discover clusters of related memories.

---

## Quick Links

- [Quick Start](/guide/quick-start) - Get started in 5 minutes
- [Retrieval Strategies](/guide/retrieval-strategies) - Search methods
- [Chunking](/guide/chunking) - Text chunking options
- [Examples](/examples/) - See it in action
