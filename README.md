# 🎁 Souvenir

**Memory management system for AI agents built with the Vercel AI SDK**

Souvenir provides efficient and context-aware memory capabilities for AI agents, enabling them to store, retrieve, and utilize past interactions through a hybrid architecture combining vector search with knowledge graphs.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0-orange)](https://bun.sh/)

## Features

- 🔍 **Semantic Search** - Vector-based similarity search using pgvector
- 🕸️ **Knowledge Graphs** - Relationship-aware memory with graph traversal
- 🧩 **Entity Extraction** - Automatic entity and relationship detection
- 🔄 **Multi-Runtime Support** - Works on Node.js 20+, Bun, Deno, and Cloudflare Workers
- 🛠️ **Pre-built Tools** - Ready-to-use tools for Vercel AI SDK v5
- 📦 **Type-Safe** - Full TypeScript support with comprehensive types
- 🎯 **ETL Pipeline** - Extract, Transform, Load architecture for memory processing

## Installation

```bash
npm install @upstart.gg/souvenir ai postgres
# or
bun add @upstart.gg/souvenir ai postgres
```

## Quick Start

### 1. Set up your database

Souvenir requires PostgreSQL with the `pgvector` extension. Run the migrations:

```bash
# Using dbmate
dbmate -d db/migrations -s db/schema.sql up
```

### 2. Initialize Souvenir

```typescript
import { Souvenir, AIEmbeddingProvider } from '@upstart.gg/souvenir';
import { openai } from '@ai-sdk/openai';

const souvenir = new Souvenir(
  {
    databaseUrl: process.env.DATABASE_URL!,
  },
  {
    // Use any embedding model from Vercel AI SDK
    embeddingProvider: new AIEmbeddingProvider(
      openai.embedding('text-embedding-3-small')
    ),
    // Use any LLM for entity/relationship extraction
    processorModel: openai('gpt-4o-mini'),
  }
);
```

### 3. Store and retrieve memories

```typescript
// Create a session to group related memories
const session = await souvenir.createSession('conversation-1');

// Add data to memory
await souvenir.add('The user prefers dark mode in their IDE.', {
  sessionId: session.id,
});

// Process the data (extract entities, relationships, generate embeddings)
await souvenir.processAll({ sessionId: session.id });

// Search memories
const results = await souvenir.search('What are the user preferences?', {
  sessionId: session.id,
});

console.log(results[0].node.content); // "The user prefers dark mode..."
```

## Using with Vercel AI SDK Tools

Souvenir provides pre-built tools that work seamlessly with the Vercel AI SDK:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createSouvenirTools } from '@upstart.gg/souvenir/tools';

const tools = createSouvenirTools(souvenir);

const result = await generateText({
  model: openai('gpt-4o'),
  tools,
  maxSteps: 10,
  prompt: 'Remember that I love TypeScript and use it for all my projects.',
});
```

The AI agent can now autonomously:
- Store information in memory with `storeMemory`
- Search for relevant memories with `searchMemory`
- Explore related memories with `getRelatedMemories`
- Find connection paths with `findMemoryPaths`
- Create new sessions with `createSession`

## Core Concepts

### ETL Pipeline

Souvenir uses an Extract-Transform-Load (ETL) pipeline inspired by data processing systems:

1. **Extract** (`add()`) - Chunk and store raw data
2. **Transform** (`processAll()`) - Extract entities, relationships, and generate embeddings
3. **Load** - Store processed data in the knowledge graph

### Knowledge Graph

Beyond simple vector search, Souvenir builds a knowledge graph where:
- **Nodes** represent memory units (chunks, entities, concepts)
- **Edges** represent relationships (similarity, containment, semantic connections)
- **Graph operations** enable sophisticated memory traversal and exploration

```typescript
// Find memories connected to a specific node
const neighborhood = await souvenir.getNeighborhood(nodeId, { maxDepth: 2 });

// Find paths between two memories
const paths = await souvenir.findPaths(startNodeId, endNodeId);

// Discover clusters of related concepts
const clusters = await souvenir.findClusters(sessionId);
```

### Sessions

Sessions group related memories together, enabling:
- Scoped searches (only search within a conversation or topic)
- Context isolation (separate work memories from personal ones)
- Bulk operations (process or analyze all memories in a session)

## Architecture

Souvenir's hybrid architecture combines:

- **PostgreSQL** with **pgvector** for vector storage and similarity search
- **Native graph operations** for relationship traversal
- **LLM-powered extraction** for entities and relationships
- **Vercel AI SDK** for model-agnostic embeddings and text generation

This approach is inspired by research on optimizing the interface between knowledge graphs and LLMs for complex reasoning.

## API Reference

### Core Methods

#### `add(data: string, options?: AddOptions): Promise<string[]>`
Add data to memory. Returns chunk IDs.

#### `processAll(options?: SouvenirProcessOptions): Promise<void>`
Process unprocessed chunks (extract entities, relationships, generate embeddings).

#### `search(query: string, options?: SearchOptions): Promise<SearchResult[]>`
Search memory using semantic similarity.

#### `createSession(name?: string, metadata?: Record<string, unknown>): Promise<MemorySession>`
Create a new memory session.

### Graph Operations

#### `getNeighborhood(nodeId: string, options?: TraversalOptions)`
Get nodes within N hops of a starting node.

#### `findPaths(startNodeId: string, endNodeId: string, options?: TraversalOptions)`
Find connection paths between two memories.

#### `findClusters(sessionId?: string, minClusterSize?: number)`
Discover clusters of related memories.

### Tools API

See [tools documentation](./src/tools/README.md) for the complete Vercel AI SDK tools interface.

## Configuration

```typescript
interface SouvenirConfig {
  databaseUrl: string;              // PostgreSQL connection string
  embeddingDimensions?: number;     // Default: 1536 (OpenAI ada-002)
  chunkSize?: number;               // Default: 1000
  chunkOverlap?: number;            // Default: 200
  minRelevanceScore?: number;       // Default: 0.7
  maxResults?: number;              // Default: 10
}
```

## Multi-Runtime Support

Souvenir works across multiple JavaScript runtimes:

- **Node.js** 20+ ✅
- **Bun** ✅
- **Deno** ✅ (with npm specifiers)
- **Cloudflare Workers** ✅ (with polyfills)

## Examples

See the [`examples/`](./examples) directory for complete working examples:

- **Basic Usage** - Core functionality walkthrough
- **With Tools** - Using Souvenir tools with Vercel AI SDK
- **Knowledge Graph** - Exploring graph operations and relationships

## Database Schema

Souvenir uses the following tables:

- `memory_nodes` - Individual memory units with embeddings
- `memory_relationships` - Connections between memories
- `memory_sessions` - Session groupings
- `session_nodes` - Many-to-many session-node associations
- `memory_chunks` - Raw chunks before processing

See [`db/migrations/`](./db/migrations) for the complete schema.

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run tests with coverage
bun test:coverage

# Build
bun run build

# Lint and format
bun run lint
bun run format
```

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit PRs.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Acknowledgments

Souvenir's architecture is inspired by research on optimizing knowledge graphs for LLM integration and hybrid memory systems combining vector search with graph-based reasoning.

---

Built with ❤️ using [Vercel AI SDK](https://sdk.vercel.ai), [Bun](https://bun.sh), and [PostgreSQL](https://www.postgresql.org)
