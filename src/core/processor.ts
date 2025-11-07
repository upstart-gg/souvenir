import { generateText } from "ai";
import type {
  ExtractedEntity,
  ExtractedRelationship,
  MemoryChunk,
  PromptTemplates,
  SouvenirProcessOptions,
} from "../types.js";

/**
 * Default prompt templates (from paper's optimization findings)
 */
const DEFAULT_PROMPTS: Required<PromptTemplates> = {
  entityExtraction: `Extract key entities from the following text. Return them as a JSON array of objects with "text", "type", and optional "metadata" fields.

Entity types can be: person, organization, location, concept, event, date, technology, or other.

Text:
{content}

Return only valid JSON, no additional text.`,

  relationshipExtraction: `Given the following entities: {entities}

Extract relationships between these entities from the text below. Return them as a JSON array of objects with "source", "target", "type", and optional "weight" (0-1) fields.

Relationship types can be: related_to, part_of, caused_by, enables, requires, similar_to, or other descriptive types.

Text:
{content}

Return only valid JSON, no additional text.`,

  summarization: `Provide a concise summary of the following text in {maxLength} characters or less:

{content}`,

  qa: `Answer the following question using the provided context. Be concise and direct.

Context:
{context}

Question: {question}

Answer:`,
};

/**
 * Souvenir processor for extracting entities and relationships from text
 */
export class SouvenirProcessor {
  private prompts: Required<PromptTemplates>;

  constructor(
    private model: Parameters<typeof generateText>[0]["model"],
    customPrompts?: Partial<PromptTemplates>,
  ) {
    this.prompts = { ...DEFAULT_PROMPTS, ...customPrompts };
  }

  /**
   * Extract entities from text content using configurable prompt
   */
  async extractEntities(
    content: string,
    customPrompt?: string,
  ): Promise<ExtractedEntity[]> {
    const promptTemplate = customPrompt || this.prompts.entityExtraction;
    const prompt = promptTemplate.replace("{content}", content);

    try {
      const { text } = await generateText({
        model: this.model,
        prompt,
        maxOutputTokens: 1000,
      });

      const entities = JSON.parse(text);
      return Array.isArray(entities) ? entities : [];
    } catch (error) {
      console.error("Entity extraction failed:", error);
      return [];
    }
  }

  /**
   * Extract relationships from text content using configurable prompt
   */
  async extractRelationships(
    content: string,
    entities: ExtractedEntity[],
    customPrompt?: string,
  ): Promise<ExtractedRelationship[]> {
    if (entities.length < 2) {
      return [];
    }

    const entityList = entities.map((e) => e.text).join(", ");
    const promptTemplate = customPrompt || this.prompts.relationshipExtraction;
    const prompt = promptTemplate
      .replace("{entities}", entityList)
      .replace("{content}", content);

    try {
      const { text } = await generateText({
        model: this.model,
        prompt,
        maxOutputTokens: 1000,
      });

      const relationships = JSON.parse(text);
      return Array.isArray(relationships) ? relationships : [];
    } catch (error) {
      console.error("Relationship extraction failed:", error);
      return [];
    }
  }

  /**
   * Generate a summary of content using configurable prompt
   */
  async generateSummary(
    content: string,
    maxLength: number = 200,
  ): Promise<string> {
    const promptTemplate = this.prompts.summarization;
    const prompt = promptTemplate
      .replace("{maxLength}", maxLength.toString())
      .replace("{content}", content);

    try {
      const { text } = await generateText({
        model: this.model,
        prompt,
        maxOutputTokens: 100,
      });

      return text.trim();
    } catch (error) {
      console.error("Summary generation failed:", error);
      return `${content.slice(0, maxLength)}...`;
    }
  }

  /**
   * Generate a summary from multiple content pieces
   * Used for session-level or subgraph summaries (per paper)
   */
  async generateMultiContentSummary(
    contents: string[],
    summaryType: "session" | "subgraph",
    maxLength: number = 500,
  ): Promise<string> {
    const combinedContent = contents.join("\n\n---\n\n");

    const prompt = `Generate a comprehensive summary of the following ${summaryType} content.
Identify key themes, entities, and relationships. Keep it under ${maxLength} characters.

Content:
${combinedContent}

Summary:`;

    try {
      const { text } = await generateText({
        model: this.model,
        prompt,
        maxOutputTokens: 200,
      });

      return text.trim();
    } catch (error) {
      console.error("Multi-content summary generation failed:", error);
      // Fallback: concatenate first parts of each content
      return contents
        .map((c) => c.slice(0, Math.floor(maxLength / contents.length)))
        .join(" ... ")
        .slice(0, maxLength);
    }
  }

  /**
   * Process a chunk and extract structured information
   */
  async processChunk(
    chunk: MemoryChunk,
    options: SouvenirProcessOptions = {},
  ): Promise<{
    entities: ExtractedEntity[];
    relationships: ExtractedRelationship[];
    summary: string;
  }> {
    const {
      extractEntities = true,
      extractRelationships = true,
      entityPrompt,
      relationshipPrompt,
    } = options;

    let entities: ExtractedEntity[] = [];
    let relationships: ExtractedRelationship[] = [];

    if (extractEntities) {
      entities = await this.extractEntities(chunk.content, entityPrompt);
    }

    if (extractRelationships && entities.length > 0) {
      relationships = await this.extractRelationships(
        chunk.content,
        entities,
        relationshipPrompt,
      );
    }

    const summary = await this.generateSummary(chunk.content);

    return { entities, relationships, summary };
  }

  /**
   * Get the current prompt templates
   */
  getPrompts(): Required<PromptTemplates> {
    return { ...this.prompts };
  }

  /**
   * Update prompt templates
   */
  updatePrompts(prompts: Partial<PromptTemplates>): void {
    this.prompts = { ...this.prompts, ...prompts };
  }
}
