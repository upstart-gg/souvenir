# Examples

Learn how to add memory to your Vercel AI SDK agents with these practical examples.

## Core Examples

### [With Vercel AI SDK](/examples/vercel-ai-sdk)

The essential example showing how to add memory tools to your agent:

```typescript
const tools = createSouvenirTools(souvenir);

await generateText({
  model: openai('gpt-4'),
  tools,
  messages: [...]
});
```

**You'll learn:**
- How to create and use memory tools
- How the agent automatically stores and retrieves memories
- How to handle multi-turn conversations

[View full example →](/examples/vercel-ai-sdk)

---

### [Streaming Responses](/examples/streaming)

Build agents with streaming responses and memory:

```typescript
const result = streamText({
  model: openai('gpt-4'),
  tools,
  messages: [...]
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

**You'll learn:**
- How to use memory tools with streaming
- How to show real-time responses
- How tool calls work with streaming

[View full example →](/examples/streaming)

---

### [Multi-User Chat](/examples/multi-user)

Handle multiple users with separate memory spaces:

```typescript
// User 1
await generateText({
  model: openai('gpt-4'),
  tools,
  sessionId: 'user-alice',
  messages: [...]
});

// User 2 (separate memories)
await generateText({
  model: openai('gpt-4'),
  tools,
  sessionId: 'user-bob',
  messages: [...]
});
```

**You'll learn:**
- How to use `sessionId` for multi-user support
- How to keep user memories separate
- How to manage concurrent conversations

[View full example →](/examples/multi-user)

---

## More Examples

Check out the [examples directory](https://github.com/upstart-gg/souvenir/tree/main/examples) on GitHub for additional examples:

- **chatbot** - Complete chatbot with memory
- **customer-support** - Support agent that remembers users
- **personal-assistant** - Assistant that tracks tasks and preferences
- **multi-session** - Advanced session management

---

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

- [Quick Start](/guide/quick-start) - Get started in 5 minutes
- [Memory Tools API](/api/tools) - Tool documentation
- [Configuration](/configuration/) - Configure Souvenir
