import { generateObject } from "ai";
import { z } from "zod";
import type {
  ExtractedEntity,
  ExtractedRelationship,
  MemoryChunk,
  PromptTemplates,
  SouvenirProcessOptions,
} from "../types.js";

/**
 * Zod schemas for structured extraction
 */
const ExtractedEntitySchema = z.object({
  text: z.string().describe("The text of the entity"),
  type: z
    .string()
    .describe(
      "The type/category of the entity (e.g., person, organization, location, concept, event, date, technology, etc.)",
    ),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Additional metadata about the entity"),
});

const EntityExtractionSchema = z.object({
  entities: z
    .array(ExtractedEntitySchema)
    .describe("Array of extracted entities from the text"),
});

const ExtractedRelationshipSchema = z.object({
  source: z.string().describe("The source entity text"),
  target: z.string().describe("The target entity text"),
  type: z
    .string()
    .describe(
      "The type of relationship (e.g., related_to, part_of, caused_by, enables, requires, similar_to, etc.)",
    ),
  weight: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("The strength of the relationship (0-1)"),
});

const RelationshipExtractionSchema = z.object({
  relationships: z
    .array(ExtractedRelationshipSchema)
    .describe("Array of extracted relationships between entities"),
});

const SummarizationSchema = z.object({
  summary: z.string().describe("A concise summary of the content"),
});

/**
 * Default prompt templates (from paper's optimization findings)
 */
const DEFAULT_PROMPTS: Required<PromptTemplates> = {
  entityExtraction: `Extract key entities from the following text. Identify important people, organizations, locations, concepts, events, dates, technologies, and other significant entities.

Be thorough but accurate. Only extract entities that are clearly mentioned or strongly implied in the text.

Text:
{content}`,

  relationshipExtraction: `Given the following entities: {entities}

Extract meaningful relationships between these entities from the text below. Focus on direct relationships that are explicitly stated or strongly implied.

Types of relationships to consider: related_to, part_of, caused_by, enables, requires, similar_to, and other descriptive types.

Assign a weight between 0 and 1 to indicate the strength of each relationship (1 = very strong, 0 = weak).

Text:
{content}`,

  summarization: `Provide a concise summary of the following text. Keep it under {maxLength} characters while capturing the key information and main ideas.

Text:
{content}`,

  qa: `Answer the following question using the provided context. Be concise and direct. If the answer cannot be determined from the context, say so clearly.

Context:
{context}

Question: {question}`,
};

/**
 * Souvenir processor for extracting entities and relationships from text
 */
export class SouvenirProcessor {
  private prompts: Required<PromptTemplates>;

  constructor(
    private model: Parameters<typeof generateObject>[0]["model"],
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
      const result = await generateObject({
        model: this.model,
        schema: EntityExtractionSchema,
        prompt,
        temperature: 0.3,
      });

      return result.object.entities;
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
      const result = await generateObject({
        model: this.model,
        schema: RelationshipExtractionSchema,
        prompt,
        temperature: 0.3,
      });

      return result.object.relationships;
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
      const result = await generateObject({
        model: this.model,
        schema: SummarizationSchema,
        prompt,
        temperature: 0.5,
      });

      return result.object.summary;
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
${combinedContent}`;

    try {
      const result = await generateObject({
        model: this.model,
        schema: SummarizationSchema,
        prompt,
        temperature: 0.5,
      });

      return result.object.summary;
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
