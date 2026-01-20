/**
 * Intent Schema Generation
 *
 * Uses a fast LLM (GROQ via OpenRouter) to pre-analyze user requests
 * and generate structured guidance for the sandbox agent.
 *
 * This runs in parallel with sandbox warm-up for zero latency cost.
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  type IntentSchema,
  type UserAgentPolicy,
  validateIntentSchema,
  applyUserPolicy,
  createDefaultIntentSchema,
} from "./types";
import {
  getAllKSAs,
  getKSANames,
  CORE_KSAS,
  type KSAInfo,
} from "../ksaPolicy";
import { KSA_KNOWLEDGE, buildKsaAboutSummary } from "../../../shared/ksaKnowledge";
import { MODEL_PRESETS, resolveModel } from "../models";

// ============================================================================
// Configuration
// ============================================================================

/** Model to use for intent schema generation - uses "fast" preset */
const INTENT_SCHEMA_MODEL = resolveModel("fast");

/** Fallback model if primary fails */
const FALLBACK_MODEL = "google/gemini-2.0-flash-001";

/** Max tokens for schema generation */
const MAX_TOKENS = 2000;

/** Temperature - lower for more structured output */
const TEMPERATURE = 0.3;

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build a compact KSA registry summary for the prompt
 */
function buildKSARegistrySummary(): string {
  const ksas = getAllKSAs();

  // Group by category
  const byCategory = new Map<string, KSAInfo[]>();
  for (const ksa of ksas) {
    const cat = ksa.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(ksa);
  }

  const lines: string[] = [];

  // Core KSAs (always available)
  const core = byCategory.get("core") || [];
  if (core.length > 0) {
    lines.push("## Core KSAs (Always Available)");
    for (const k of core) {
      const about = KSA_KNOWLEDGE[k.name]?.about;
      lines.push(`- **${k.name}**: ${k.description}`);
      if (about) {
        lines.push(`  ${about.split('\n')[0]}`); // First line of ABOUT
      }
    }
    lines.push("");
  }

  // Skills KSAs
  const skills = byCategory.get("skills") || [];
  if (skills.length > 0) {
    lines.push("## Skills KSAs (Research & Visual)");
    for (const k of skills) {
      const about = KSA_KNOWLEDGE[k.name]?.about;
      lines.push(`- **${k.name}**: ${k.description}`);
      if (about) {
        lines.push(`  ${about.split('\n')[0]}`); // First line of ABOUT
      }
    }
    lines.push("");
  }

  // Deliverables KSAs
  const deliverables = byCategory.get("deliverables") || [];
  if (deliverables.length > 0) {
    lines.push("## Deliverables KSAs (Output Formats)");
    for (const k of deliverables) {
      const about = KSA_KNOWLEDGE[k.name]?.about;
      lines.push(`- **${k.name}**: ${k.description}`);
      if (about) {
        lines.push(`  ${about.split('\n')[0]}`); // First line of ABOUT
      }
    }
    lines.push("");
  }

  // Add detailed ABOUT for key KSAs
  lines.push("## Detailed KSA Usage Guidelines");
  lines.push(buildKsaAboutSummary(["canvas", "frames", "workspaces", "artifacts"]));

  return lines.join("\n");
}

/**
 * Build the system prompt for intent schema generation
 */
function buildSchemaGenerationPrompt(
  userPrompt: string,
  threadContext?: string,
  enabledSkills?: string[]
): string {
  const ksaRegistry = buildKSARegistrySummary();
  const allKSANames = getKSANames();

  return `You are an Intent Analyzer for an AI agent system. Your job is to pre-analyze user requests and generate an Intent Schema that guides agent execution.

${ksaRegistry}

## Available KSA Names
${allKSANames.join(", ")}

---

## User Request
${userPrompt}

${threadContext ? `## Conversation Context\n${threadContext}\n` : ""}
${enabledSkills?.length ? `## Pre-selected Skills\n${enabledSkills.join(", ")}\n` : ""}

---

## Your Task
Analyze the user's request and generate an Intent Schema with:

1. **intent**: Break down what the user wants
   - summary: One-line summary (max 100 chars)
   - objective: What they're trying to accomplish
   - context: Key context elements (entities, constraints, preferences)
   - domain: Topic area (e.g., "research", "content", "automation", "design")

2. **ksas**: Prioritize which KSAs the agent should use
   - priority: Top 3-5 KSAs to use first (ordered)
   - secondary: Other potentially useful KSAs
   - notNeeded: KSAs clearly not relevant
   - reasoning: Brief explanation of your choices

3. **plan**: Suggested execution approach
   - goals: 2-4 goals with importance levels (critical/important/nice-to-have)
   - deliverables: Expected outputs with type (markdown/json/csv/pdf/html/code/email)
   - steps: 3-6 high-level execution steps

4. **policy**: Default access controls
   - enabledKSAs: All KSAs from priority + secondary
   - disabledKSAs: Empty (user can override)
   - allowExternalCalls: true (unless user is asking for local-only work)

## Output Format
Respond with ONLY valid JSON matching this structure:

\`\`\`json
{
  "intent": {
    "summary": "string",
    "objective": "string",
    "context": ["string"],
    "domain": "string"
  },
  "ksas": {
    "priority": ["ksa_name"],
    "secondary": ["ksa_name"],
    "notNeeded": ["ksa_name"],
    "reasoning": "string"
  },
  "plan": {
    "goals": [
      { "id": "g1", "text": "string", "importance": "critical|important|nice-to-have" }
    ],
    "deliverables": [
      { "id": "d1", "type": "markdown|json|csv|pdf|html|code|email", "name": "string", "description": "string" }
    ],
    "steps": ["string"]
  },
  "policy": {
    "enabledKSAs": ["ksa_name"],
    "disabledKSAs": [],
    "allowExternalCalls": true
  }
}
\`\`\`

IMPORTANT:
- Use ONLY KSA names from the Available KSA Names list
- Be concise - this schema guides execution, not documentation
- If the request is simple, keep the schema simple
- If deliverables aren't explicitly needed, use an empty array
- Respond with ONLY the JSON, no other text`;
}

// ============================================================================
// Parsing and Validation
// ============================================================================

/**
 * Extract JSON from LLM response (handles markdown code blocks)
 */
function extractJSON(content: string): string {
  // Try to extract from code block first
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return content.trim();
}

/**
 * Parse and validate the LLM response into an IntentSchema
 */
function parseIntentSchemaResponse(
  content: string,
  model: string
): IntentSchema {
  const jsonStr = extractJSON(content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e}`);
  }

  // Validate structure
  if (!validateIntentSchema(parsed)) {
    throw new Error("Invalid Intent Schema structure");
  }

  // Add metadata
  const schema = parsed as IntentSchema;
  schema.meta = {
    model,
    generatedAt: Date.now(),
    confidence: determineConfidence(schema),
  };

  // Ensure policy.enabledKSAs includes core
  schema.policy.enabledKSAs = [
    ...new Set([...CORE_KSAS, ...schema.policy.enabledKSAs]),
  ];

  return schema;
}

/**
 * Determine confidence level based on schema quality
 */
function determineConfidence(schema: IntentSchema): "high" | "medium" | "low" {
  let score = 0;

  // Check intent completeness
  if (schema.intent.summary.length > 10) score++;
  if (schema.intent.objective.length > 20) score++;
  if (schema.intent.context.length > 0) score++;

  // Check KSA selection
  if (schema.ksas.priority.length >= 2) score++;
  if (schema.ksas.reasoning.length > 20) score++;

  // Check plan quality
  if (schema.plan.goals.length >= 2) score++;
  if (schema.plan.steps.length >= 3) score++;

  if (score >= 6) return "high";
  if (score >= 4) return "medium";
  return "low";
}

// ============================================================================
// Main Action
// ============================================================================

/**
 * Generate Intent Schema for a user request
 *
 * Calls a fast LLM (GROQ via OpenRouter) to analyze the request and
 * generate structured guidance for the sandbox agent.
 */
export const generateIntentSchema = internalAction({
  args: {
    /** The user's prompt/request */
    prompt: v.string(),
    /** Optional conversation context from thread history */
    threadContext: v.optional(v.string()),
    /** Pre-selected skill IDs from the UI */
    skillIds: v.optional(v.array(v.string())),
    /** User policy overrides */
    userPolicy: v.optional(v.any()),
    /** Skip generation and return default schema */
    skipGeneration: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<IntentSchema> => {
    const startTime = Date.now();

    // If skip requested, return default
    if (args.skipGeneration) {
      const enabledKSAs = args.skillIds?.length
        ? [...CORE_KSAS, ...args.skillIds]
        : getKSANames();
      return createDefaultIntentSchema(args.prompt, enabledKSAs);
    }

    // Build the prompt
    const schemaPrompt = buildSchemaGenerationPrompt(
      args.prompt,
      args.threadContext,
      args.skillIds
    );

    let schema: IntentSchema;
    let usedModel = INTENT_SCHEMA_MODEL;

    try {
      // Call GROQ via OpenRouter
      const response = await ctx.runAction(
        internal.services.OpenRouter.internal.chatCompletion,
        {
          model: INTENT_SCHEMA_MODEL,
          messages: [{ role: "user", content: schemaPrompt }],
          maxTokens: MAX_TOKENS,
          temperature: TEMPERATURE,
        }
      );

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from LLM");
      }

      schema = parseIntentSchemaResponse(content, INTENT_SCHEMA_MODEL);
    } catch (primaryError) {
      console.error(
        `[IntentSchema] Primary model failed: ${primaryError}, trying fallback`
      );

      try {
        // Try fallback model
        const response = await ctx.runAction(
          internal.services.OpenRouter.internal.chatCompletion,
          {
            model: FALLBACK_MODEL,
            messages: [{ role: "user", content: schemaPrompt }],
            maxTokens: MAX_TOKENS,
            temperature: TEMPERATURE,
          }
        );

        const content = response.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("Empty response from fallback LLM");
        }

        schema = parseIntentSchemaResponse(content, FALLBACK_MODEL);
        usedModel = FALLBACK_MODEL;
      } catch (fallbackError) {
        console.error(
          `[IntentSchema] Fallback model also failed: ${fallbackError}`
        );

        // Return default schema as last resort
        const enabledKSAs = args.skillIds?.length
          ? [...CORE_KSAS, ...args.skillIds]
          : getKSANames();
        schema = createDefaultIntentSchema(args.prompt, enabledKSAs);
        schema.meta.confidence = "low";
      }
    }

    // Apply user policy overrides
    if (args.userPolicy) {
      schema = applyUserPolicy(
        schema,
        args.userPolicy as Partial<UserAgentPolicy>
      );
    }

    // Add latency to metadata
    schema.meta.latencyMs = Date.now() - startTime;
    schema.meta.model = usedModel;

    console.log(
      `[IntentSchema] Generated in ${schema.meta.latencyMs}ms using ${usedModel}:`,
      {
        summary: schema.intent.summary,
        priorityKSAs: schema.ksas.priority,
        goals: schema.plan.goals.length,
        deliverables: schema.plan.deliverables.length,
        confidence: schema.meta.confidence,
      }
    );

    return schema;
  },
});

/**
 * Generate Intent Schema with timeout protection
 *
 * Wraps generateIntentSchema with a timeout to ensure we don't block
 * sandbox startup if LLM is slow.
 */
export const generateIntentSchemaWithTimeout = internalAction({
  args: {
    prompt: v.string(),
    threadContext: v.optional(v.string()),
    skillIds: v.optional(v.array(v.string())),
    userPolicy: v.optional(v.any()),
    /** Timeout in milliseconds (default: 3000ms) */
    timeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<IntentSchema | null> => {
    const timeout = args.timeoutMs || 3000;

    try {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Intent schema generation timed out")), timeout);
      });

      // Race between generation and timeout
      const schema = await Promise.race([
        ctx.runAction(internal.intentSchema.generateIntentSchema, {
          prompt: args.prompt,
          threadContext: args.threadContext,
          skillIds: args.skillIds,
          userPolicy: args.userPolicy,
        }),
        timeoutPromise,
      ]);

      return schema;
    } catch (error) {
      console.warn(`[IntentSchema] Generation failed or timed out: ${error}`);
      return null; // Caller should use default schema
    }
  },
});
