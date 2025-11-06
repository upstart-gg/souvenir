# Quick Start

This guide will walk you through creating your first memory-enabled AI agent with Souvenir in under 5 minutes.

## Create a Souvenir Instance

First, initialize Souvenir with your database connection:

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
```

## Step 1: Add Memory (Extract)

Add content to memory. Souvenir will automatically chunk it:

```typescript
const sessionId = 'user-123';

const chunkIds = await souvenir.add(
  'The Eiffel Tower is a wrought-iron lattice tower in Paris, France. ' +
  'It was designed by Gustave Eiffel and completed in 1889.',
  {
    sessionId,
    sourceIdentifier: 'eiffel-tower-info',
    metadata: { topic: 'landmarks', location: 'Paris' },
  }
);

console.log(`Added ${chunkIds.length} chunks`);
```

## Step 2: Process Memory (Transform)

Extract entities and relationships from the chunks:

```typescript
await souvenir.processAll({
  sessionId,
  generateEmbeddings: true,
  generateSummaries: true,
});

console.log('Memory processed and indexed!');
```

This will:
- Extract entities (Eiffel Tower, Paris, France, Gustave Eiffel)
- Create relationships (located_in, designed_by)
- Generate embeddings for semantic search
- Create summary nodes

## Step 3: Search Memory (Load)

Now you can search the memory using different strategies:

### Vector Search

```typescript
const results = await souvenir.search('What landmarks are in Paris?', {
  sessionId,
  strategy: 'vector',
  topK: 3,
});

for (const result of results) {
  console.log(`Score: ${result.score}`);
  console.log(`Content: ${result.node.content}`);
}
```

### Graph Search

```typescript
const graphContext = await souvenir.searchGraph('Tell me about the Eiffel Tower', {
  sessionId,
  topK: 3,
});

console.log(graphContext.content); // Formatted for LLM
```

### Hybrid Search

```typescript
const hybridContext = await souvenir.searchHybrid('Who designed the Eiffel Tower?', {
  sessionId,
  topK: 3,
});

console.log(hybridContext.content); // Combines vector + graph
```

## Use with Vercel AI SDK

Souvenir provides pre-built tools for the Vercel AI SDK:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createSouvenirTools } from '@upstart-gg/souvenir/tools';

const tools = createSouvenirTools(souvenir);

const result = await generateText({
  model: openai('gpt-4o'),
  tools,
  toolChoice: 'auto',
  sessionId: 'user-123',
  messages: [
    {
      role: 'user',
      content: 'Remember that I love pizza with mushrooms',
    },
  ],
});

console.log(result.text);
```

The agent will automatically:
- Store the memory using `storeMemory` tool
- Search memory when needed using `searchMemory` tool
- Use graph traversal with `searchGraph` tool

## Complete Example

Here's a full working example:

```typescript
import { Souvenir } from '@upstart-gg/souvenir';
import { createSouvenirTools } from '@upstart-gg/souvenir/tools';
import { openai } from '@ai-sdk/openai';
import { generateText, embed } from 'ai';

// Initialize Souvenir
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

// Create tools
const tools = createSouvenirTools(souvenir);

// Use in conversation
const sessionId = 'demo-session';

// First message: Store memory
await generateText({
  model: openai('gpt-4o'),
  tools,
  toolChoice: 'auto',
  sessionId,
  messages: [
    {
      role: 'user',
      content: 'My name is Alice and I work as a software engineer at Acme Corp.',
    },
  ],
});

// Second message: Retrieve memory
const result = await generateText({
  model: openai('gpt-4o'),
  tools,
  toolChoice: 'auto',
  sessionId,
  messages: [
    { role: 'user', content: 'What do you remember about me?' },
  ],
});

console.log(result.text); // Will use memory to respond!

// Clean up
await souvenir.close();
```

## Next Steps

- [ETL Pipeline](/guide/etl-pipeline) - Learn about Extract-Transform-Load workflow
- [Retrieval Strategies](/guide/retrieval-strategies) - Explore different search methods
- [Configuration](/configuration/) - Customize Souvenir for your needs
- [API Reference](/api/souvenir) - Full API documentation
