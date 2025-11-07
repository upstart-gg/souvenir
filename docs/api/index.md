# API Reference

Souvenir provides a simple API focused on tools for Vercel AI SDK agents.

## Memory Tools (Main API)

The primary way to use Souvenir is through the memory tools:

### [Memory Tools](/api/tools)

Pre-built tools for Vercel AI SDK agents that handle all memory operations automatically:

```typescript
import { createSouvenirTools } from '@upstart-gg/souvenir/tools';

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

[View full tool documentation →](/api/tools)

---

## Configuration

### [Souvenir Options](/api/souvenir)

Configuration options for creating a Souvenir instance:

```typescript
const souvenir = new Souvenir(
  {
    databaseUrl: string,
    embeddingDimensions: number,
    chunkSize?: number,
    chunkOverlap?: number,
    // ... more options
  },
  {
    embeddingProvider: EmbeddingProvider,
    processorModel: LanguageModel,
    promptTemplates?: PromptTemplates,
  }
);
```

[View all configuration options →](/api/souvenir)

### [Type Reference](/api/types)

TypeScript type definitions for all operations.

[View type definitions →](/api/types)

---

## Quick Links

- [Memory Tools](/api/tools) - The main API you'll use
- [Souvenir Options](/api/souvenir) - Configuration reference
- [Type Reference](/api/types) - TypeScript types
- [Quick Start](/guide/quick-start) - Get started in 5 minutes
- [Examples](/examples/) - See it in action
