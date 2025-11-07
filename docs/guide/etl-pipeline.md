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

**Token Mode** (default):
- Fixed-size chunks with overlap
- Predictable chunk sizes
- Good for consistent context windows

**Recursive Mode**:
- Hierarchical splitting (paragraphs → sentences → words)
- Respects document structure
- Better for maintaining semantic boundaries

See [Chunking Configuration](/guide/chunking) for advanced options.

## Transform Phase

The transform phase processes chunks to extract structured information.

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
import { Souvenir } from '@upstart-gg/souvenir';
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
const sessionId = 'demo';
await souvenir.add('Paris is the capital of France...', { sessionId });

// TRANSFORM: Process and extract entities/relationships
await souvenir.processAll({
  sessionId,
  generateEmbeddings: true,
  generateSummaries: true,
});

// LOAD: Data is automatically stored in the database

// RETRIEVE: Search using different strategies
const vectorResults = await souvenir.search('capital of France', {
  sessionId,
  strategy: 'vector',
});

const graphContext = await souvenir.searchGraph('Tell me about Paris', {
  sessionId,
});

console.log(graphContext.content);
```

## Best Practices

### 1. Batch Processing

Process multiple additions in one go:

```typescript
// Add all content first
await souvenir.add('Document 1...', { sessionId });
await souvenir.add('Document 2...', { sessionId });
await souvenir.add('Document 3...', { sessionId });

// Then process all at once
await souvenir.processAll({ sessionId, generateEmbeddings: true });
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

Add new content incrementally:

```typescript
// Initial load
await souvenir.add('Initial content...', { sessionId });
await souvenir.processAll({ sessionId });

// Later, add more content
await souvenir.add('New content...', { sessionId });
await souvenir.processAll({ sessionId }); // Only processes new chunks
```

## Next Steps

- [Retrieval Strategies](/guide/retrieval-strategies) - Learn about search methods
- [Chunking Configuration](/guide/chunking) - Optimize chunking for your content
- [Custom Embeddings](/guide/custom-embeddings) - Use different embedding models
