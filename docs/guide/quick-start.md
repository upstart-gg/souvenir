# Quick Start

Give your Vercel AI SDK agent long-term memory in under 5 minutes.

## Overview

Souvenir provides **automatic memory tools** for AI agents. Your agent will:
- ✅ Automatically store important information
- ✅ Retrieve relevant memories when needed
- ✅ Build a knowledge graph of entities and relationships
- ✅ Remember across conversations

You just create the tools and add them to your agent. That's it.

## Setup

### 1. Create Souvenir Instance (Per User/Session)

```typescript
import { Souvenir } from '@upstart-gg/souvenir';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';

// Create one instance per user/session
const souvenir = new Souvenir(
  {
    databaseUrl: process.env.DATABASE_URL!,
    embeddingDimensions: 1536,
  },
  {
    sessionId: 'user-123', // Bind to specific user/session
    embeddingProvider: {
      embed: async (text) => {
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

**Important**: Create a separate Souvenir instance for each user/session. Each instance is bound to a specific sessionId, ensuring complete data isolation.

### 2. Create Memory Tools

```typescript
import { createSouvenirTools } from '@upstart-gg/souvenir/tools';

const tools = createSouvenirTools(souvenir);
```

That's it! You now have 2 tools:
- `storeMemory` - Store important information
- `searchMemory` - Search past memories (with configurable retrieval strategies)

### 3. Use in Your Agent

```typescript
import { generateText } from 'ai';

const result = await generateText({
  model: openai('gpt-4'),
  tools,
  maxSteps: 10,
  messages: [
    {
      role: 'user',
      content: 'My name is Alice and I work as a software engineer at Acme Corp.',
    },
  ],
});

console.log(result.text);
// Agent automatically stores: "User's name is Alice, works as software engineer at Acme Corp"
```

## Complete Example

Here's a full working agent with memory:

```typescript
import { Souvenir } from '@upstart-gg/souvenir';
import { createSouvenirTools } from '@upstart-gg/souvenir/tools';
import { openai } from '@ai-sdk/openai';
import { generateText, embed } from 'ai';

// Helper to create Souvenir instance for a user
function createUserMemory(sessionId: string) {
  return new Souvenir(
    {
      databaseUrl: process.env.DATABASE_URL!,
      embeddingDimensions: 1536,
    },
    {
      sessionId, // Bind to user session
      embeddingProvider: {
        embed: async (text) => {
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
}

// Create memory instance for user
const bobMemory = createUserMemory('user-bob');
const bobTools = createSouvenirTools(bobMemory);

// Chat with agent
async function chat(message: string, tools: any) {
  const result = await generateText({
    model: openai('gpt-4'),
    tools,
    maxSteps: 10,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant with long-term memory. Store important information about the user and recall it when relevant.',
      },
      {
        role: 'user',
        content: message,
      },
    ],
  });

  return result.text;
}

// First conversation
const response1 = await chat(
  "Hi! I'm Bob. I love Italian food and I'm allergic to shellfish.",
  bobTools
);
console.log(response1);
// Agent stores: name=Bob, loves Italian food, allergic to shellfish

// Later conversation (same session)
const response2 = await chat(
  "Can you recommend a restaurant?",
  bobTools
);
console.log(response2);
// Agent searches memory, finds preferences, recommends Italian restaurant without shellfish

await bobMemory.close();
```

**Multi-User Pattern:**
```typescript
// Each user gets their own isolated memory
const aliceMemory = createUserMemory('user-alice');
const bobMemory = createUserMemory('user-bob');

const aliceTools = createSouvenirTools(aliceMemory);
const bobTools = createSouvenirTools(bobMemory);

// Complete data isolation - Alice and Bob can't access each other's memories
```

## How It Works

### Behind the Scenes

When your agent runs:

1. **Agent receives user message**
2. **Agent decides** whether to:
   - Store new information → calls `storeMemory` tool
   - Retrieve past information → calls `searchMemory` tool (with optional strategy parameter)
3. **Souvenir processes** the information:
   - Chunks text
   - Extracts entities and relationships
   - Builds knowledge graph
   - Generates embeddings
4. **Agent uses** the retrieved information to respond

### Knowledge Graph

Based on research ([arXiv:2505.24478](https://arxiv.org/abs/2505.24478)), Souvenir builds a knowledge graph:

```
User Message: "I'm Alice and I work at Acme Corp"

Extracts:
- Entity: Alice (person)
- Entity: Acme Corp (organization)
- Relationship: Alice → works_at → Acme Corp

Stores in graph for future retrieval
```

### Retrieval Strategies

The agent can use different retrieval strategies:

- **Vector search** - Find similar memories
- **Graph traversal** - Find connected information
- **Hybrid** - Combine both approaches

The tools automatically choose the best strategy based on the query.

## Multi-User Support

Use `sessionId` to separate user memories:

```typescript
// User 1
await chat("I love pizza", 'user-alice');

// User 2
await chat("I love sushi", 'user-bob');

// Each user has separate memories
```

## What Gets Stored?

The agent automatically stores:
- ✅ User preferences ("I like dark mode")
- ✅ Facts about the user ("My birthday is June 5")
- ✅ Important context ("I'm working on Project X")
- ✅ Decisions and agreements ("Let's meet next Tuesday")
- ✅ Relationships ("Alice works with Bob")

The agent does NOT store:
- ❌ Trivial information ("Hello", "Thanks")
- ❌ Questions without answers
- ❌ Temporary context

## Configuration

### Minimal Configuration

```typescript
const souvenir = new Souvenir({
  databaseUrl: process.env.DATABASE_URL!,
  embeddingDimensions: 1536, // Must match your embedding model
});
```

### With Options

```typescript
const souvenir = new Souvenir(
  {
    databaseUrl: process.env.DATABASE_URL!,
    embeddingDimensions: 1536,

    // Optional: Adjust chunking (defaults are good for most cases)
    chunkSize: 1000,
    chunkOverlap: 200,

    // Optional: Filter search results
    minRelevanceScore: 0.7,
  },
  {
    // Required: Embedding provider
    embeddingProvider: {
      generateEmbedding: async (text) => { /* ... */ },
    },

    // Required: LLM for entity/relationship extraction
    processorModel: openai('gpt-4o-mini'),

    // Optional: Customize extraction prompts
    promptTemplates: {
      entityExtraction: 'Extract entities...',
      relationshipExtraction: 'Extract relationships...',
    },
  }
);
```

## Production Tips

### 1. Use Session IDs
Always pass `sessionId` to separate user memories:
```typescript
await generateText({
  model: openai('gpt-4'),
  tools,
  sessionId: userId, // Important!
  messages: [...],
});
```

### 2. System Prompt
Guide the agent on when to use memory:
```typescript
const systemPrompt = `You are a helpful assistant with long-term memory.

IMPORTANT:
- Store important user information (preferences, facts, goals)
- Retrieve memories when relevant to the conversation
- Don't store trivial information like greetings`;
```

### 3. Max Steps
Allow enough steps for tool usage:
```typescript
await generateText({
  model: openai('gpt-4'),
  tools,
  maxSteps: 10, // Allow multiple tool calls
  messages: [...],
});
```

### 4. Error Handling
```typescript
try {
  const result = await generateText({
    model: openai('gpt-4'),
    tools,
    messages: [...],
  });
  return result.text;
} catch (error) {
  console.error('Agent error:', error);
  // Fallback behavior
}
```

## Next Steps

- [See the Tools in Action](/examples/vercel-ai-sdk) - Complete example with streaming
- [Knowledge Graph Explanation](/guide/knowledge-graphs) - How the graph works
- [Configuration Options](/configuration/) - All configuration options

---

## Troubleshooting

### Agent doesn't use memory tools
- ✅ Check `maxSteps` is high enough (minimum 5)
- ✅ Add guidance in system prompt
- ✅ Verify `sessionId` is passed

### Memories aren't retrieved
- ✅ Check embedding dimensions match your model
- ✅ Lower `minRelevanceScore` if too strict
- ✅ Verify database migrations ran correctly

### Performance is slow
- ✅ Entity/relationship extraction is async (runs in background)
- ✅ Retrieval is fast (uses vector index)
- ✅ Consider using `gpt-4o-mini` for processing
