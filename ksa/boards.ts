/**
 * Boards KSA - Knowledge, Skills, and Abilities
 *
 * Manage and execute kanban boards programmatically.
 * Use this to create boards, add cards, and trigger automated execution.
 *
 * IMPORTANT: When creating boards, ALWAYS design appropriate stages.
 * Each stage needs: name, stageType ('agent' or 'human'), and optionally goals.
 *
 * @example
 * import { listBoards, createBoard, addCard, runCard } from './ksa/boards';
 *
 * // List all boards
 * const boards = await listBoards();
 *
 * // Create a board with well-designed stages
 * const boardId = await createBoard('Research Pipeline', {
 *   description: 'Automated research workflow',
 *   stages: [
 *     { name: 'Gather Data', stageType: 'agent', goals: ['Find 5 sources'] },
 *     { name: 'Analyze', stageType: 'agent', goals: ['Identify key trends'] },
 *     { name: 'Report', stageType: 'agent', goals: ['Generate summary report'] },
 *     { name: 'Review', stageType: 'human' }
 *   ]
 * });
 *
 * // Add a card and run it
 * const cardId = await addCard(boardId, 'task-1', 'Analyze competitor X');
 * const result = await runCard(cardId);
 */

import { callGateway } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

export interface Board {
  _id: string;
  name: string;
  description?: string;
  orgId: string;
  createdBy: string;
  stages: Stage[];
  trigger?: {
    type: "manual" | "schedule" | "webhook";
    config?: Record<string, unknown>;
  };
  _creationTime: number;
}

export interface Stage {
  _id: string;
  boardId: string;
  name: string;
  order: number;
  stageType: "agent" | "human";
  goals?: Array<{ id: string; text: string; done: boolean }>;
  skills?: Array<{ id: string; name: string; icon: string; config?: unknown }>;
  assignees?: Array<{ id: string; name: string; email: string }>;
  deliverables?: Array<{ id: string; name: string; required: boolean }>;
}

export interface Card {
  _id: string;
  boardId: string;
  taskId: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  currentStage: number;
  data?: Record<string, unknown>;
  _creationTime: number;
}

export interface CardStatus {
  cardId: string;
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  currentStage: number;
  stageName: string;
  progress?: number;
  lastUpdate?: number;
}

export interface BoardExecutionResult {
  cardId: string;
  status: "completed" | "failed" | "blocked";
  stageName: string;
  artifacts?: Array<{ id: string; name: string; type: string }>;
  summary?: string;
  error?: string;
}

export interface StageConfig {
  name: string;
  stageType: "agent" | "human";
  goals?: string[];
  skills?: string[];
  deliverables?: Array<{ name: string; required?: boolean }>;
}

export interface TriggerConfig {
  name: string;
  methods: {
    prompt: boolean;    // Chat/prompt input
    webform: boolean;   // Web form submission
    webhook: boolean;   // API webhook
    mcp: boolean;       // MCP tool call
    schedule?: boolean; // Scheduled runs
    email?: boolean;    // Email trigger
  };
  chat: {
    images: { enabled: boolean; maxSize: string };
    files: { enabled: boolean; maxSize: string; types: string[] };
    urls: { enabled: boolean; scrape: boolean };
    placeholder?: string;
    emptyStateMessage?: string;
    systemPrompt: string;
    startWithPlan?: boolean;
    clarifyingQuestions?: {
      beforeStart: boolean;
      duringStages: boolean;
    };
  };
  form: {
    fields: Array<{
      id: string;
      label: string;
      type: string;
      required: boolean;
      placeholder?: string;
    }>;
  };
  schedule?: {
    interval: string;  // 'daily', 'weekly', 'monthly'
    time: string;      // '09:00'
    timezone: string;  // 'America/New_York'
  };
  email?: {
    prefix: string;
    allowedDomains: string[];
    subjectAsTitle: boolean;
    includeAttachments: boolean;
    autoReply: {
      enabled: boolean;
      message?: string;
    };
  };
}

// ============================================================================
// Functions
// ============================================================================

/**
 * List all boards accessible to the current user.
 *
 * @param orgId - Optional organization ID to filter by
 * @returns Array of boards
 *
 * @example
 * const boards = await listBoards();
 * for (const b of boards) {
 *   console.log(`${b.name} - ${b.stages.length} stages`);
 * }
 */
export async function listBoards(orgId?: string): Promise<Board[]> {
  const response = await callGateway<{ boards: Board[] }>(
    "features.kanban.boards.list",
    { orgId },
    "query"
  );
  return response.boards || response as unknown as Board[];
}

/**
 * Get a board with its stages and configuration.
 *
 * @param boardId - The board ID
 * @returns Board details or null if not found
 *
 * @example
 * const board = await getBoard('abc123');
 * console.log(`${board.name} has ${board.stages.length} stages`);
 */
export async function getBoard(boardId: string): Promise<Board | null> {
  try {
    const response = await callGateway<Board>(
      "features.kanban.boards.get",
      { boardId },
      "query"
    );
    return response;
  } catch {
    return null;
  }
}

/**
 * Create a new board with optional custom stages.
 *
 * @param name - Board name
 * @param options - Optional configuration including stages
 * @returns The new board ID
 *
 * @example
 * // Create a simple board with default stages (Backlog, In Progress, Done)
 * const boardId = await createBoard('My Board');
 *
 * @example
 * // Create a board with custom stages
 * const boardId = await createBoard('Content Pipeline', {
 *   stages: [
 *     { name: 'Research', stageType: 'agent', goals: ['Find 5 sources'] },
 *     { name: 'Write', stageType: 'agent', skills: ['web', 'pdf'] },
 *     { name: 'Review', stageType: 'human' }
 *   ]
 * });
 *
 * @example
 * // Create from a template
 * const boardId = await createBoard('My Research', { template: 'research-report' });
 */
export async function createBoard(
  name: string,
  options?: {
    description?: string;
    template?: string;
    stages?: StageConfig[];
    trigger?: TriggerConfig;
    workspaceMode?: "per_card" | "shared";
  }
): Promise<string> {
  // If template specified, use template creation
  if (options?.template) {
    const response = await callGateway<string>(
      "features.kanban.templates.createBoardFromTemplate",
      {
        templateId: options.template,
        name,
      },
      "mutation"
    );
    return response;
  }

  // Create the board using internal mutation (no Convex auth required)
  const hasCustomStages = options?.stages && options.stages.length > 0;
  const response = await callGateway<string>(
    "internal.features.kanban.boards.createInternal",
    {
      name,
      description: options?.description,
      workspaceMode: options?.workspaceMode || "per_card",
      blank: hasCustomStages, // Skip default tasks if custom stages
    },
    "mutation"
  );
  const boardId = response;

  // Add custom stages if provided
  if (hasCustomStages && options.stages) {
    for (let i = 0; i < options.stages.length; i++) {
      const stage = options.stages[i];
      await callGateway(
        "internal.features.kanban.boards.addTaskInternal",
        {
          boardId,
          name: stage.name,
          order: i,
          stageType: stage.stageType,
          agentPrompt: stage.goals?.join(". "),
        },
        "mutation"
      );
    }
  }

  // Set trigger if provided
  if (options?.trigger) {
    await setTrigger(boardId, options.trigger);
  }

  return boardId;
}

/**
 * Set the trigger configuration for a board.
 * Triggers define how cards are created on the board.
 *
 * @param boardId - The board ID
 * @param trigger - The trigger configuration
 *
 * @example
 * // Set a chat-based trigger
 * await setTrigger(boardId, {
 *   name: 'Chat Trigger',
 *   methods: { prompt: true, webform: false, webhook: false, mcp: false },
 *   chat: {
 *     images: { enabled: true, maxSize: '10MB' },
 *     files: { enabled: true, maxSize: '25MB', types: ['pdf', 'docx'] },
 *     urls: { enabled: true, scrape: true },
 *     systemPrompt: 'You are analyzing brand data...',
 *     startWithPlan: true,
 *   },
 *   form: { fields: [] },
 * });
 */
export async function setTrigger(boardId: string, trigger: TriggerConfig): Promise<void> {
  await callGateway(
    "internal.features.kanban.boards.updateTriggerInternal",
    { id: boardId, trigger },
    "mutation"
  );
}

/**
 * Add a card to a board.
 *
 * @param boardId - The board ID
 * @param taskId - Unique task identifier
 * @param name - Card name/title
 * @param options - Optional card configuration
 * @returns The new card ID
 *
 * @example
 * const cardId = await addCard(boardId, 'task-001', 'Research AI trends', {
 *   data: { topic: 'generative AI', depth: 'thorough' },
 *   autoRun: true
 * });
 */
export async function addCard(
  boardId: string,
  taskId: string,
  name: string,
  options?: {
    data?: Record<string, unknown>;
    autoRun?: boolean;
  }
): Promise<string> {
  const response = await callGateway<{ cardId: string }>(
    "internal.features.kanban.boards.createCardInternal",
    {
      boardId,
      taskId,
      name,
      data: options?.data,
    },
    "mutation"
  );

  const cardId = response.cardId || (response as unknown as string);

  // Auto-run if requested
  if (options?.autoRun) {
    await runCard(cardId);
  }

  return cardId;
}

/**
 * Run a card through the board pipeline.
 * Triggers execution starting from the current stage.
 *
 * @param cardId - The card ID to execute
 * @returns Execution result with status and artifacts
 *
 * @example
 * const result = await runCard(cardId);
 * if (result.status === 'completed') {
 *   console.log('Artifacts:', result.artifacts);
 * }
 */
export async function runCard(cardId: string): Promise<BoardExecutionResult> {
  const response = await callGateway<BoardExecutionResult>(
    "agent.workflows.agentBoard.startCardExecution",
    { cardId },
    "action"
  );
  return response;
}

/**
 * Get the current status of a card.
 *
 * @param cardId - The card ID
 * @returns Current execution status
 *
 * @example
 * const status = await getCardStatus(cardId);
 * console.log(`Card is ${status.status} at stage ${status.stageName}`);
 */
export async function getCardStatus(cardId: string): Promise<CardStatus> {
  const response = await callGateway<Card>(
    "features.kanban.boards.getCard",
    { cardId },
    "query"
  );

  // Get board to resolve stage name
  const board = await getBoard(response.boardId);
  const stageName = board?.stages[response.currentStage]?.name || `Stage ${response.currentStage}`;

  return {
    cardId: response._id,
    status: response.status,
    currentStage: response.currentStage,
    stageName,
    lastUpdate: response._creationTime,
  };
}

/**
 * Wait for a card to complete execution.
 * Polls the card status until it completes, fails, or times out.
 *
 * @param cardId - The card ID
 * @param timeoutMs - Maximum wait time in milliseconds (default: 5 minutes)
 * @returns Final execution result
 *
 * @example
 * // Wait up to 10 minutes for completion
 * const result = await waitForCard(cardId, 600000);
 * if (result.status === 'completed') {
 *   console.log('Done! Artifacts:', result.artifacts);
 * }
 */
export async function waitForCard(
  cardId: string,
  timeoutMs = 300000
): Promise<BoardExecutionResult> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds

  while (Date.now() - startTime < timeoutMs) {
    const status = await getCardStatus(cardId);

    if (status.status === "completed" || status.status === "failed" || status.status === "blocked") {
      // Get final result with artifacts
      const cardResponse = await callGateway<{
        card: Card;
        artifacts: Array<{ _id: string; name: string; type: string }>;
      }>(
        "features.kanban.boards.getCardWithArtifacts",
        { cardId },
        "query"
      );

      return {
        cardId,
        status: status.status as "completed" | "failed" | "blocked",
        stageName: status.stageName,
        artifacts: cardResponse.artifacts?.map((a) => ({
          id: a._id,
          name: a.name,
          type: a.type,
        })),
      };
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout reached
  const finalStatus = await getCardStatus(cardId);
  return {
    cardId,
    status: "failed",
    stageName: finalStatus.stageName,
    error: `Timeout after ${timeoutMs}ms - card still ${finalStatus.status}`,
  };
}

/**
 * Stop a running card.
 *
 * @param cardId - The card ID to stop
 *
 * @example
 * await stopCard(cardId);
 */
export async function stopCard(cardId: string): Promise<void> {
  await callGateway(
    "features.kanban.boards.stopCard",
    { cardId },
    "mutation"
  );
}

/**
 * Get cards that have completed execution.
 *
 * @param boardId - The board ID
 * @param limit - Maximum cards to return (default: 10)
 * @returns Array of completed cards
 *
 * @example
 * const completed = await getCompletedCards(boardId, 5);
 * for (const card of completed) {
 *   console.log(`${card.name} - completed`);
 * }
 */
export async function getCompletedCards(
  boardId: string,
  limit = 10
): Promise<Card[]> {
  const response = await callGateway<{ cards: Card[] }>(
    "features.kanban.boards.getCompletedCards",
    { boardId, limit },
    "query"
  );
  return response.cards || response as unknown as Card[];
}

// ============================================================================
// Templates
// ============================================================================

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "research" | "content" | "data" | "automation" | "custom";
  stageCount: number;
}

/**
 * List available board templates.
 * Templates provide pre-configured workflows for common use cases.
 *
 * @param category - Optional category filter
 * @returns Array of available templates
 *
 * @example
 * const templates = await listTemplates();
 * for (const t of templates) {
 *   console.log(`${t.name}: ${t.description}`);
 * }
 *
 * @example
 * // Filter by category
 * const researchTemplates = await listTemplates('research');
 */
export async function listTemplates(category?: string): Promise<BoardTemplate[]> {
  const response = await callGateway<BoardTemplate[]>(
    "features.kanban.templates.listTemplates",
    { category },
    "query"
  );
  return response;
}

/**
 * Get details of a specific template including its stages.
 *
 * @param templateId - The template ID
 * @returns Template details or null if not found
 *
 * @example
 * const template = await getTemplate('research-report');
 * console.log(`${template.name} has ${template.stages.length} stages`);
 */
export async function getTemplate(templateId: string): Promise<{
  id: string;
  name: string;
  description: string;
  stages: Array<{
    name: string;
    stageType: "agent" | "human";
    description: string;
    skills: Array<{ id: string; name: string; icon: string }>;
    deliverables: Array<{ id: string; type: string; name: string }>;
    goals: Array<{ id: string; text: string; done: boolean }>;
  }>;
} | null> {
  try {
    const response = await callGateway(
      "features.kanban.templates.getTemplate",
      { templateId },
      "query"
    );
    return response as any;
  } catch {
    return null;
  }
}

/**
 * Create a board from a template.
 * This is a shortcut for createBoard with template option.
 *
 * Available templates:
 * - 'research-report': Research a topic and generate PDF report
 * - 'content-pipeline': Create blog posts/articles with outline→draft→polish flow
 * - 'data-analysis': Process data, analyze, and generate insights report
 * - 'competitor-research': Research competitors and create competitive analysis
 * - 'social-monitoring': Monitor social media mentions and sentiment
 *
 * @param templateId - The template ID to use
 * @param name - Optional custom name for the board
 * @returns The new board ID
 *
 * @example
 * // Create a research board
 * const boardId = await createBoardFromTemplate('research-report', 'AI Trends Research');
 *
 * @example
 * // Create a content pipeline
 * const boardId = await createBoardFromTemplate('content-pipeline', 'Q4 Blog Posts');
 */
export async function createBoardFromTemplate(
  templateId: string,
  name?: string
): Promise<string> {
  const response = await callGateway<string>(
    "features.kanban.templates.createBoardFromTemplate",
    { templateId, name },
    "mutation"
  );
  return response;
}
