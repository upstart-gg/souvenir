# Examples

Learn how to add memory to your Vercel AI SDK agents with these practical examples.

## Getting Started

Check out the [Quick Start Guide](/guide/quick-start) for a complete working example that shows:
- How to create and use memory tools
- How the agent automatically stores and retrieves memories
- How to handle multi-turn conversations

## Example Structure

All examples follow this pattern:

```typescript
// 1. Setup Souvenir
const souvenir = new Souvenir(config, options);

// 2. Get tools
const tools = createSouvenirTools(souvenir);

// 3. Use in agent
const result = await generateText({
  model: openai('gpt-4'),
  tools,
  sessionId: 'user-id',
  messages: [...]
});

// 4. The agent automatically uses memory tools when needed
```

---

## Next Steps

- [Quick Start](/guide/quick-start) - Complete working example
- [Retrieval Strategies](/guide/retrieval-strategies) - Different search approaches
- [Chunking Configuration](/guide/chunking) - Text splitting options

````
