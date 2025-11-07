# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Souvenir is a memory management system for AI agents built with the Vercel AI SDK. It provides efficient and context-aware memory capabilities through a hybrid architecture combining vector search with knowledge graphs, based on research from *"Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning"*.

## Common Commands

### Development
```bash
# Build the library (uses bunup)
bun run build

# Type checking
bun run typecheck

# Linting (uses Biome)
bun run lint
bun run lint:fix

# Formatting
bun run format
bun run format:check
```

### Testing
```bash
# Run all tests (starts Docker, runs tests, stops Docker)
bun test

# Run tests in CI mode (requires DATABASE_URL)
bun run test:ci

# Watch mode
bun run test:watch

# Coverage
bun run test:coverage

# Run a single test file
bun test src/__tests__/chunking.test.ts
```

### Docker & Database
```bash
# Start PostgreSQL with pgvector
bun run docker:up

# Stop Docker
bun run docker:down

# Clean up Docker volumes
bun run docker:clean

# View logs
bun run docker:logs

# Diagnose database issues
bun run db:diagnose
```

### Documentation
```bash
# Run documentation site locally
bun run docs:dev

# Build documentation
bun run docs:build

# Preview built docs
bun run docs:preview
```

## Architecture

### ETL Pipeline Design

Souvenir uses an Extract-Transform-Load (ETL) pipeline inspired by data processing systems:

1. **Extract** (`souvenir.add()`) - Chunks and stores raw data as MemoryChunks
2. **Transform** (`souvenir.processAll()`) - Background processing extracts entities, relationships, and generates embeddings
3. **Load** - Processed data stored as MemoryNodes in the knowledge graph with relationships

### Core Components

#### `Souvenir` (src/core/souvenir.ts)
Main entry point class that coordinates all operations:
- Manages database client, repository, and graph operations
- Provides `add()` method for storing memories (Extract phase)
- Provides `processAll()` method for background processing (Transform phase)
- Provides `search()` method for retrieval with multiple strategies
- Session management for context isolation

#### `SouvenirProcessor` (src/core/processor.ts)
Handles LLM-powered extraction during Transform phase:
- Entity extraction from text
- Relationship extraction between entities
- Configurable prompts with defaults from research paper
- Uses Vercel AI SDK's `generateText()`

#### `RetrievalStrategies` (src/core/retrieval.ts)
Implements multiple retrieval strategies from research:
- **vector** - Baseline semantic similarity search
- **graph-neighborhood** - Retrieve connected nodes
- **graph-completion** - Format graph triplets for LLMs
- **graph-summary** - Use summary nodes for retrieval
- **hybrid** - Combine multiple strategies for best results

#### `GraphOperations` (src/graph/operations.ts)
Knowledge graph traversal operations:
- BFS path finding between nodes
- Neighborhood retrieval
- Relationship exploration with depth limits
- Graph subgraph extraction

#### Pre-built Tools (src/tools/index.ts)
Two primary tools for Vercel AI SDK integration:
- `storeMemory` - Store information with automatic processing
- `searchMemory` - Search with automatic graph exploration and LLM-formatted results

### Data Model

- **MemoryChunk** - Raw unprocessed content from Extract phase
- **MemoryNode** - Processed memory unit with embeddings in Load phase
- **MemoryRelationship** - Edges between nodes in knowledge graph
- **MemorySession** - Groups related memories for context isolation

### Database

- **PostgreSQL** with **pgvector** extension required
- Migrations in `db/migrations/` formatted for [dbmate](https://github.com/amacneil/dbmate)
- Schema in `db/schema.sql`
- Test database runs in Docker on port 54322

## Multi-Runtime Support

Souvenir supports Node.js 20+, Bun, Deno, and Cloudflare Workers. When making changes:
- Use standard Web APIs when possible
- Test with Bun (primary development runtime)
- Avoid Node-specific APIs unless necessary
- Keep dependencies minimal and runtime-agnostic

## Code Style & Conventions

### TypeScript
- Strict mode enabled with `noUncheckedIndexedAccess`
- Full type safety with `isolatedDeclarations`
- ES modules with `.js` extensions in imports
- Export types and interfaces from `types.ts`

### Formatting & Linting
- Uses **Biome** (not Prettier/ESLint)
- Double quotes for JavaScript/TypeScript
- Space indentation
- Run `bun run lint:fix` before committing

### Testing
- Test files in `src/__tests__/`
- Integration tests use real PostgreSQL with Docker
- Setup in `src/__tests__/setup.ts`
- Tests must clean up data between runs
- Use descriptive test names with "should" pattern

## Key Implementation Details

### Chunking Strategy
- Default: "recursive" mode for better semantic coherence
- Alternative: "token" mode for precise token limits
- Uses `@chonkiejs/core` for advanced chunking
- Configure via `SouvenirConfig` with `chunkSize` and `chunkOverlap`

### Embedding Management
- Dimension validation on first embed (prevents mismatch errors)
- Batch embedding support for efficiency
- Default: 1536 dimensions (OpenAI text-embedding-3-small)
- Provider interface in `src/embedding/provider.ts`

### Session Scoping
- All operations scoped to session ID
- Search results filtered by session
- Use separate sessions for different conversation contexts
- Session metadata stored in `memory_sessions` table

### Graph Relationships
- Bidirectional traversal supported
- Weighted relationships (0-1 scale)
- Types: related_to, part_of, caused_by, enables, requires, similar_to
- Relationship filtering in search and traversal

## Publishing

Uses Changesets for version management:
```bash
# Create a changeset
bun run changeset

```

Published as `@upstart.gg/souvenir` on npm.
