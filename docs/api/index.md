# API Reference

Complete API documentation for Souvenir.

## Core Classes

### Souvenir

The main entry point for the Souvenir memory system.

```typescript
import { Souvenir } from '@upstart-gg/souvenir';

const souvenir = new Souvenir(config, options);
```

- [Full Documentation](/api/souvenir)

### MemoryRepository

Low-level database operations for memory nodes and relationships.

```typescript
import { MemoryRepository } from '@upstart-gg/souvenir';

const repository = new MemoryRepository(databaseClient);
```

- [Full Documentation](/api/repository)

### GraphOperations

Knowledge graph traversal and manipulation.

```typescript
import { GraphOperations } from '@upstart-gg/souvenir';

const graph = new GraphOperations(repository);
```

- [Full Documentation](/api/graph)

## Tools

### Vercel AI SDK Tools

Pre-built tools for use with the Vercel AI SDK.

```typescript
import { createSouvenirTools } from '@upstart-gg/souvenir/tools';

const tools = createSouvenirTools(souvenir);
```

- [Full Documentation](/api/tools)

## Utilities

### Chunking

Text chunking with advanced configuration.

```typescript
import { chunkText } from '@upstart-gg/souvenir';

const chunks = await chunkText(text, {
  mode: 'token',
  chunkSize: 1000,
  chunkOverlap: 200,
});
```

- [Full Documentation](/api/chunking)

### Formatting

Format retrieval results for LLM consumption.

```typescript
import {
  formatSearchResultsForLLM,
  formatGraphRetrievalForLLM,
  formatGraphTripletsForLLM,
} from '@upstart-gg/souvenir';
```

- [Full Documentation](/api/formatting)

## Types

Complete TypeScript type definitions.

- [Type Reference](/api/types)

## Quick Links

- [Souvenir Class](/api/souvenir) - Main API
- [Tools](/api/tools) - Vercel AI SDK integration
- [Types](/api/types) - TypeScript types
