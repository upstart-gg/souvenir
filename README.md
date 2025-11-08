# Souvenir

**Memory management system for AI agents built with the Vercel AI SDK**

Souvenir provides efficient and context-aware memory capabilities for AI agents, enabling them to store, retrieve, and utilize past interactions through a hybrid architecture combining vector search with knowledge graphs.

## Features

**Based on research from** *"Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning"* ([arXiv:2505.24478](https://arxiv.org/abs/2505.24478))

- **Multiple Retrieval Strategies** - Vector, graph-neighborhood, graph-completion, graph-summary, and hybrid modes
- **Knowledge Graphs** - Relationship-aware memory with graph traversal and formatted triplets for LLMs
- **Summary Nodes** - Automatic session and subgraph summarization for better retrieval
- **Entity Extraction** - Configurable LLM-powered entity and relationship detection
- **Context Formatting** - Optimized graph context formatting for LLM consumption
- **Multi-Runtime Support** - Works on Node.js 20+, Bun, Deno, and Cloudflare Workers
- **Pre-built Tools** - Ready-to-use tools for Vercel AI SDK v5
- **Type-Safe** - Full TypeScript support with comprehensive types
- **ETL Pipeline** - Extract, Transform, Load architecture

## Installation

```bash
npm install @upstart.gg/souvenir ai postgres
# or
bun add @upstart.gg/souvenir ai postgres
```

## Quick Start

### 1. Set up your database

Souvenir requires PostgreSQL with the `pgvector` extension. 
You can find migration files in the `db/migrations/` directory.
Those are formated for use with [dbmate](https://github.com/amacneil/dbmate).

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
    databaseUrl: process.env.DATABASE_URL,
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

### 3. Integrate Souvenir tools into your agent

```typescript
import { generateText } from 'ai';

// Initialize Souvenir with a session
const souvenir = new Souvenir(
  {
    databaseUrl: process.env.DATABASE_URL!,
  },
  {
    sessionId: 'conversation-1', // Group related memories
    // Use any embedding model from Vercel AI SDK
    embeddingProvider: new AIEmbeddingProvider(
      openai.embedding('text-embedding-3-small')
    ),
    // Use any LLM for entity/relationship extraction
    processorModel: openai('gpt-4o-mini'),
  }
);

// Create tools for the agent
const tools = createSouvenirTools(souvenir);

// Agent autonomously uses memory
const result = await generateText({
  model: openai('gpt-4o'),
  tools,
  maxSteps: 10,
  messages: [
    {
      role: 'user',
      content: 'Remember: I love dark mode, TypeScript, and minimalist UI design.',
    }
  ],
});

// [...]
// Agent automatically stores preferences and can retrieve them later
```

## Souvenir pre-built tools

Souvenir provides **3 pre-built tools** that work seamlessly with the Vercel AI SDK. This is the primary way to use Souvenir - through AI agents autonomously calling memory tools:

### Available Tools

1. **`storeMemory`** - Store information in long-term memory
   - Automatically chunks content
   - Triggers background processing (entity extraction, embeddings, graph building)
   - Non-blocking - returns immediately while processing happens

2. **`searchMemory`** - Search memory with automatic graph exploration
   - Searches using semantic similarity (vector search)
   - Optionally explores the knowledge graph for related context
   - Returns LLM-consumable formatted results with `<memory-node id="..."/>` tags

3. **`deleteMemory`** - Delete specific memories by node ID
   - Remove outdated or incorrect information
   - Node IDs can be extracted from `searchMemory` results
   - Supports bulk deletion

## Core Concepts

### ETL Pipeline

Souvenir uses an Extract-Transform-Load (ETL) pipeline inspired by data processing systems:

1. **Extract** - `storeMemory` chunks and stores raw data
2. **Transform** - Background processing extracts entities, relationships, and generates embeddings
3. **Load** - Processed data stored in the knowledge graph

### Knowledge Graph

Beyond simple vector search, Souvenir builds a knowledge graph where:
- **Nodes** represent memory units (chunks, entities, concepts)
- **Edges** represent relationships (similarity, containment, semantic connections)
- **Graph Exploration** - `searchMemory` automatically traverses relationships to enrich context

The knowledge graph enables sophisticated reasoning. When you search with `searchMemory`, it:
1. Finds semantically relevant memories via vector similarity
2. Explores connected nodes in the graph (relationships, concepts)
3. Returns formatted context that's immediately usable by LLMs

### Sessions

Sessions group related memories together:
- **Isolation** - Keep separate conversation contexts or topics isolated
- **Scoped Search** - `searchMemory` respects session boundaries
- **Context Management** - One session per conversation thread or user context

## Architecture

Souvenir's hybrid architecture combines:

- **PostgreSQL** with **pgvector** for vector storage and similarity search
- **Native graph operations** for relationship traversal
- **LLM-powered extraction** for entities and relationships
- **Vercel AI SDK** for model-agnostic embeddings and text generation

This approach is inspired by research on optimizing the interface between knowledge graphs and LLMs for complex reasoning.

## Documentation

Comprehensive documentation is available at [https://souvenir.upstart.gg](https://souvenir.upstart.gg).

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit PRs.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Acknowledgments

Souvenir's architecture is inspired by research on optimizing knowledge graphs for LLM integration and hybrid memory systems combining vector search with graph-based reasoning.

---

Built with ❤️ and ☕ at [Upstart](https://upstart.gg)
