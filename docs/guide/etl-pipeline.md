# ETL Pipeline

Souvenir follows a clear **ETL (Extract, Transform, Load)** pipeline for memory management. Understanding this workflow is key to effectively using Souvenir.

## Overview

```
Extract → Transform → Load → Retrieve
```

1. **Extract**: Add raw text content and chunk it
2. **Transform**: Process chunks to extract entities and relationships
3. **Load**: Store in knowledge graph and vector database
4. **Retrieve**: Search using various strategies

## Extract Phase

The extract phase takes raw text and prepares it for processing.

### Adding Content

```typescript
const chunkIds = await souvenir.add(
  'Your text content here...',
  {
    sessionId: 'user-123',
    sourceIdentifier: 'document-id',
    metadata: { category: 'documentation' },
  }
);
```

### Automatic Chunking

Souvenir automatically chunks your text based on configuration:

```typescript
const souvenir = new Souvenir({
  databaseUrl: process.env.DATABASE_URL!,
  chunkSize: 1000,        // Target chunk size in tokens
  chunkOverlap: 200,      // Overlap between chunks
  chunkingMode: 'token',  // or 'recursive'
});
```

**Recursive Mode** (default - recommended):
- Hierarchical splitting (paragraphs → sentences → words)
- Respects natural boundaries and structure
- Better semantic coherence
- **Best for agents** - handles both short facts and longer context

**Token Mode**:
- Fixed-size chunks with overlap
- Predictable chunk sizes
- Good when strict token limits required
- Hierarchical splitting (paragraphs → sentences → words)
- Respects document structure
- Better for maintaining semantic boundaries

See [Chunking Configuration](/guide/chunking) for advanced options.

## Transform Phase

The transform phase processes chunks to extract structured information.

### Auto-Processing with Timer-Based Batching

By default, Souvenir uses **automatic batched processing** to optimize efficiency and reduce LLM API calls:

```typescript
const souvenir = new Souvenir(
  {
    databaseUrl: process.env.DATABASE_URL!,
    autoProcessing: true,       // Enable auto-processing (default: true)
    autoProcessDelay: 1000,     // Debounce delay in ms (default: 1000)
    autoProcessBatchSize: 10,   // Chunks per batch (default: 10)
  },
  { /* ... */ }
);

// Multiple rapid add() calls accumulate unprocessed chunks
await souvenir.add('Document 1...');
await souvenir.add('Document 2...');
await souvenir.add('Document 3...');
// Processing is automatically scheduled after 1000ms of inactivity
// All 3 documents will be processed together in one batch
```

**How it works:**
- Each `add()` call resets the processing timer
- When the timer expires, all pending chunks are processed together
- This batches multiple LLM API calls for better efficiency and cost optimization

**Force immediate processing when needed:**

```typescript
// Force processing before searching
await souvenir.forceMemoryProcessing({
  generateEmbeddings: true,
  generateSummaries: false,
});

// Now search immediately
const results = await souvenir.search('query');
```

**Disable auto-processing for manual control:**

```typescript
const souvenir = new Souvenir(
  {
    databaseUrl: process.env.DATABASE_URL!,
    autoProcessing: false, // Disable auto-processing
  },
  { /* ... */ }
);

// Manually control when to process
await souvenir.add('Content...');
await souvenir.processAll({ generateEmbeddings: true });
```

### Entity Extraction

Entities are the "nodes" in your knowledge graph:

```typescript
await souvenir.processAll({
  sessionId: 'user-123',
  generateEmbeddings: true,
  entityPrompt: `Extract named entities like people, places, organizations...`,
});
```

**Extracted Entities**:
- People (Gustave Eiffel)
- Places (Paris, France)
- Organizations (Eiffel Company)
- Concepts (wrought-iron, lattice tower)

### Relationship Extraction

Relationships are the "edges" connecting entities:

```typescript
await souvenir.processAll({
  sessionId: 'user-123',
  relationshipPrompt: `Extract relationships between entities...`,
});
```

**Extracted Relationships**:
- `(Eiffel Tower) --[located_in]--> (Paris)`
- `(Eiffel Tower) --[designed_by]--> (Gustave Eiffel)`
- `(Paris) --[part_of]--> (France)`

Each relationship has a weight (0-1) indicating confidence.

### Summary Generation

Summary nodes provide high-level context:

```typescript
await souvenir.processAll({
  sessionId: 'user-123',
  generateSummaries: true,
});
```

**Types of Summaries**:
- **Session summaries**: High-level overview of all content in a session
- **Subgraph summaries**: Summaries of entity clusters

Based on research ([arXiv:2505.24478](https://arxiv.org/abs/2505.24478)), summaries significantly improve retrieval quality.

### Embedding Generation

Generate embeddings for semantic search:

```typescript
await souvenir.processAll({
  sessionId: 'user-123',
  generateEmbeddings: true,
});
```

Embeddings are stored with each node for fast similarity search.

## Load Phase

The load phase stores processed data in the database.

### Knowledge Graph

Entities and relationships are stored in PostgreSQL:

```sql
-- Nodes (entities, chunks, summaries)
CREATE TABLE memory_nodes (
  id UUID PRIMARY KEY,
  content TEXT,
  embedding vector(1536),
  node_type VARCHAR(50),
  metadata JSONB
);

-- Relationships (edges)
CREATE TABLE memory_relationships (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES memory_nodes(id),
  target_id UUID REFERENCES memory_nodes(id),
  relationship_type VARCHAR(100),
  weight FLOAT
);
```

### Vector Index

pgvector indexes embeddings for fast similarity search:

```sql
CREATE INDEX idx_memory_nodes_embedding
ON memory_nodes
USING ivfflat (embedding vector_cosine_ops);
```

### Sessions

Content can be organized by session:

```sql
CREATE TABLE memory_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  metadata JSONB
);

CREATE TABLE session_nodes (
  session_id VARCHAR(255) REFERENCES memory_sessions(session_id),
  node_id UUID REFERENCES memory_nodes(id)
);
```

## Retrieve Phase

Once data is loaded, you can retrieve it using various strategies.

### Vector Retrieval

Semantic similarity search:

```typescript
const results = await souvenir.search('query', {
  strategy: 'vector',
  topK: 5,
});
```

### Graph Retrieval

Traverse relationships:

```typescript
const results = await souvenir.search('query', {
  strategy: 'graph-neighborhood',
  topK: 5,
});
```

### Hybrid Retrieval

Combine vector and graph:

```typescript
const results = await souvenir.search('query', {
  strategy: 'hybrid',
  topK: 5,
});
```

See [Retrieval Strategies](/guide/retrieval-strategies) for details.

## Complete Workflow Example

```typescript
import { Souvenir } from '@upstart.gg/souvenir';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

const souvenir = new Souvenir(
  {
    databaseUrl: process.env.DATABASE_URL!,
    embeddingDimensions: 1536,
    chunkSize: 1000,
    chunkOverlap: 200,
  },
  {
    embeddingProvider: {
      generateEmbedding: async (text) => {
        const { embedding } = await embed({
          model: openai.embedding('text-embedding-3-small'),
          value: text,
        });
        return embedding;
      },
    },
    processorModel: openai('gpt-4o-mini'),
  }
);

// EXTRACT: Add content
await souvenir.add('Paris is the capital of France...');

// TRANSFORM: Auto-batching processes chunks in the background
// You can force immediate processing before searching:
await souvenir.forceMemoryProcessing({
  generateEmbeddings: true,
  generateSummaries: true,
});

// LOAD: Data is automatically stored in the database

// RETRIEVE: Search using different strategies
const vectorResults = await souvenir.search('capital of France', {
  strategy: 'vector',
});

const graphContext = await souvenir.searchGraph('Tell me about Paris');

console.log(graphContext.content);
```

## Best Practices

### 1. Leverage Auto-Batching

Let Souvenir automatically batch your processing:

```typescript
// Auto-batching is enabled by default
// Multiple rapid add() calls are automatically batched
await souvenir.add('Document 1...');
await souvenir.add('Document 2...');
await souvenir.add('Document 3...');
// Processing happens automatically after the configured delay

// Force processing only when needed (e.g., before search)
await souvenir.forceMemoryProcessing({ generateEmbeddings: true });
```

**For manual control:**

```typescript
// Disable auto-processing in config
const souvenir = new Souvenir(
  { databaseUrl: '...', autoProcessing: false },
  { /* ... */ }
);

// Manually batch process
await souvenir.add('Document 1...');
await souvenir.add('Document 2...');
await souvenir.processAll({ generateEmbeddings: true });
```

### 2. Session Organization

Use sessions to organize related content:

```typescript
// User memories
await souvenir.add('...', { sessionId: 'user-alice' });

// Conversation threads
await souvenir.add('...', { sessionId: 'conversation-123' });

// Document collections
await souvenir.add('...', { sessionId: 'docs-v1' });
```

### 3. Custom Prompts

Customize extraction for your domain:

```typescript
await souvenir.processAll({
  sessionId: 'medical-records',
  entityPrompt: 'Extract medical entities: diagnoses, medications, procedures...',
  relationshipPrompt: 'Extract medical relationships: treats, causes, prevents...',
});
```

### 4. Incremental Updates

Add new content incrementally with auto-batching:

```typescript
// Initial load
await souvenir.add('Initial content...');
// Processing happens automatically after the delay

// Later, add more content
await souvenir.add('New content...');
// Only new chunks are processed automatically

// Force processing if you need immediate results
await souvenir.forceMemoryProcessing({ generateEmbeddings: true });
```

## Next Steps

- [Retrieval Strategies](/guide/retrieval-strategies) - Learn about search methods
- [Chunking Configuration](/guide/chunking) - Optimize chunking for your content
- [Quick Start](/guide/quick-start) - Get started

````
