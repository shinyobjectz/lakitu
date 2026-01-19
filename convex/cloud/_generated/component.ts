/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    mail: {
      inbox: FunctionReference<
        "action",
        "internal",
        { limit?: number; recipientId?: string },
        any,
        Name
      >;
      markRead: FunctionReference<
        "mutation",
        "internal",
        { mailId: string },
        any,
        Name
      >;
      send: FunctionReference<
        "action",
        "internal",
        {
          messageType: string;
          payload: any;
          recipientId: string;
          ttlMs?: number;
        },
        any,
        Name
      >;
    };
    workflows: {
      agentBoard: {
        startCardExecution: FunctionReference<
          "action",
          "internal",
          { boardId: string; cardId: string; runId: string; taskId: string },
          any,
          Name
        >;
        stopCardExecution: FunctionReference<
          "action",
          "internal",
          { cardId: string },
          any,
          Name
        >;
      };
      agentPrompt: {
        executeBoardPlan: FunctionReference<
          "action",
          "internal",
          {
            plan: {
              description: string;
              stages: Array<{
                description: string;
                name: string;
                order: number;
                skillId?: string;
                type: "agent" | "human";
              }>;
              title: string;
            };
            workspaceId: string;
          },
          any,
          Name
        >;
        generateBoardPlan: FunctionReference<
          "action",
          "internal",
          { userPrompt: string; workspaceId: string },
          any,
          Name
        >;
        runPrompt: FunctionReference<
          "action",
          "internal",
          {
            model?: string;
            projectId: string;
            prompt: string;
            systemPrompt?: string;
            tools?: Array<string>;
          },
          any,
          Name
        >;
        runResearch: FunctionReference<
          "action",
          "internal",
          { depth?: "quick" | "thorough"; projectId: string; query: string },
          any,
          Name
        >;
      };
      agentThread: {
        continueThread: FunctionReference<
          "action",
          "internal",
          { content: string; threadId: string; userId: string },
          any,
          Name
        >;
        getThreadWithMessages: FunctionReference<
          "query",
          "internal",
          { threadId: string; userId: string },
          any,
          Name
        >;
        listRecentThreads: FunctionReference<
          "query",
          "internal",
          { limit?: number; userId: string },
          any,
          Name
        >;
        sendMessage: FunctionReference<
          "action",
          "internal",
          {
            content: string;
            sandboxConfig?: {
              gatewayUrl: string;
              preCreatedSandbox: {
                deletedKSAs: Array<string>;
                fromPool: boolean;
                sandboxId: string;
                sandboxUrl: string;
                timings: any;
              };
              sandboxJwt: string;
            };
            skillIds?: Array<string>;
            threadId: string;
            userId: string;
          },
          any,
          Name
        >;
        startThread: FunctionReference<
          "action",
          "internal",
          {
            boardId?: string;
            content: string;
            orgId?: string;
            sandboxConfig?: {
              gatewayUrl: string;
              preCreatedSandbox: {
                deletedKSAs: Array<string>;
                fromPool: boolean;
                sandboxId: string;
                sandboxUrl: string;
                timings: any;
              };
              sandboxJwt: string;
            };
            skillIds?: Array<string>;
            title?: string;
            userId: string;
            workspaceId?: string;
          },
          any,
          Name
        >;
      };
      compileSandbox: {
        getAgents: FunctionReference<"query", "internal", {}, any, Name>;
        getBuiltInDeliverables: FunctionReference<
          "query",
          "internal",
          {},
          any,
          Name
        >;
        getBuiltInSkills: FunctionReference<"query", "internal", {}, any, Name>;
        getBuiltInTools: FunctionReference<"query", "internal", {}, any, Name>;
        getLatestVersion: FunctionReference<"query", "internal", {}, any, Name>;
        getManifest: FunctionReference<
          "query",
          "internal",
          { version?: string },
          any,
          Name
        >;
        getToolImplementation: FunctionReference<
          "query",
          "internal",
          { toolId: string },
          any,
          Name
        >;
        listCustomTools: FunctionReference<"query", "internal", {}, any, Name>;
      };
      crudBoard: {
        executePlan: FunctionReference<
          "action",
          "internal",
          {
            plan: {
              description: string;
              stages: Array<{
                description: string;
                name: string;
                order: number;
                skillId?: string;
                type: "agent" | "human";
              }>;
              title: string;
            };
            workspaceId: string;
          },
          any,
          Name
        >;
        generatePlan: FunctionReference<
          "action",
          "internal",
          { useOpenCode?: boolean; userPrompt: string; workspaceId: string },
          any,
          Name
        >;
      };
      crudKSAs: {
        get: FunctionReference<
          "query",
          "internal",
          { name: string },
          any,
          Name
        >;
        getAllConfigSchemas: FunctionReference<
          "query",
          "internal",
          {},
          any,
          Name
        >;
        getByNames: FunctionReference<
          "query",
          "internal",
          { names: Array<string> },
          any,
          Name
        >;
        getCategories: FunctionReference<"query", "internal", {}, any, Name>;
        getCoreKSANames: FunctionReference<"query", "internal", {}, any, Name>;
        getDefaultKSASet: FunctionReference<
          "query",
          "internal",
          {
            purpose: "research" | "content" | "automation" | "minimal" | "all";
          },
          any,
          Name
        >;
        getGroups: FunctionReference<"query", "internal", {}, any, Name>;
        getKSAConfigSchema: FunctionReference<
          "query",
          "internal",
          { name: string },
          any,
          Name
        >;
        getKSADefaults: FunctionReference<
          "query",
          "internal",
          { name: string },
          any,
          Name
        >;
        getMergedConfig: FunctionReference<
          "query",
          "internal",
          { name: string; userConfig: any },
          any,
          Name
        >;
        list: FunctionReference<
          "query",
          "internal",
          { category?: "core" | "skills" | "deliverables" },
          any,
          Name
        >;
        listByGroup: FunctionReference<
          "query",
          "internal",
          { group: "research" },
          any,
          Name
        >;
        listForLibrary: FunctionReference<"query", "internal", {}, any, Name>;
        listGrouped: FunctionReference<"query", "internal", {}, any, Name>;
        search: FunctionReference<
          "query",
          "internal",
          { keyword: string },
          any,
          Name
        >;
      };
      crudLorobeads: {
        compact: FunctionReference<
          "action",
          "internal",
          { cardId: string },
          any,
          Name
        >;
        getCardIssues: FunctionReference<
          "query",
          "internal",
          { cardId: string },
          any,
          Name
        >;
        getFullState: FunctionReference<
          "query",
          "internal",
          { cardId: string },
          any,
          Name
        >;
        getLatestSnapshot: FunctionReference<
          "query",
          "internal",
          { cardId: string },
          any,
          Name
        >;
        getLatestUpdateTime: FunctionReference<
          "query",
          "internal",
          { cardId: string },
          any,
          Name
        >;
        getRunSnapshot: FunctionReference<
          "query",
          "internal",
          { runId: string },
          any,
          Name
        >;
        getSnapshotById: FunctionReference<
          "query",
          "internal",
          { id: string },
          any,
          Name
        >;
        getUpdates: FunctionReference<
          "query",
          "internal",
          { cardId: string; limit?: number; since: number },
          any,
          Name
        >;
        listSnapshots: FunctionReference<
          "query",
          "internal",
          { cardId: string; limit?: number },
          any,
          Name
        >;
        pushUpdate: FunctionReference<
          "mutation",
          "internal",
          { cardId: string; clientId: string; updateBytes: ArrayBuffer },
          any,
          Name
        >;
        saveSnapshot: FunctionReference<
          "action",
          "internal",
          {
            beadsStateJson?: string;
            cardId: string;
            loroSnapshot: ArrayBuffer;
            runId?: string;
            vfsManifest?: Array<{
              path: string;
              r2Key: string;
              size: number;
              type: string;
            }>;
          },
          any,
          Name
        >;
        syncIssue: FunctionReference<
          "mutation",
          "internal",
          {
            beadsId: string;
            blocks?: Array<string>;
            cardId: string;
            metadata?: any;
            parent?: string;
            status: string;
            title: string;
            type: string;
          },
          any,
          Name
        >;
      };
      crudSkills: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            orgId?: string;
            skill: {
              category: string;
              configSchema?: any;
              defaults?: any;
              description: string;
              icon: string;
              name: string;
              prompt?: string;
              skillId: string;
              toolIds: Array<string>;
            };
            userId?: string;
          },
          any,
          Name
        >;
        get: FunctionReference<
          "query",
          "internal",
          { skillId: string },
          any,
          Name
        >;
        getByIds: FunctionReference<
          "query",
          "internal",
          { skillIds: Array<string> },
          any,
          Name
        >;
        list: FunctionReference<
          "query",
          "internal",
          {
            category?: string;
            includeBuiltIn?: boolean;
            orgId?: string;
            userId?: string;
          },
          any,
          Name
        >;
        listCategories: FunctionReference<"query", "internal", any, any, Name>;
        remove: FunctionReference<
          "mutation",
          "internal",
          { skillId: string },
          any,
          Name
        >;
        resyncBuiltIns: FunctionReference<
          "mutation",
          "internal",
          any,
          any,
          Name
        >;
        update: FunctionReference<
          "mutation",
          "internal",
          {
            skillId: string;
            updates: {
              category?: string;
              configSchema?: any;
              defaults?: any;
              description?: string;
              icon?: string;
              name?: string;
              prompt?: string;
              toolIds?: Array<string>;
            };
          },
          any,
          Name
        >;
      };
      crudThreads: {
        clearConversation: FunctionReference<
          "mutation",
          "internal",
          { projectId: string },
          any,
          Name
        >;
        createThread: FunctionReference<
          "mutation",
          "internal",
          {
            boardId?: string;
            orgId?: string;
            title?: string;
            userId: string;
            workspaceId?: string;
          },
          any,
          Name
        >;
        deleteThread: FunctionReference<
          "mutation",
          "internal",
          { threadId: string; userId: string },
          any,
          Name
        >;
        getConversation: FunctionReference<
          "query",
          "internal",
          { projectId: string },
          any,
          Name
        >;
        getThreadArtifact: FunctionReference<
          "query",
          "internal",
          { artifactId: string },
          any,
          Name
        >;
        getThreadBrandContext: FunctionReference<
          "query",
          "internal",
          { threadId: string },
          any,
          Name
        >;
        getThreadMessages: FunctionReference<
          "query",
          "internal",
          { threadId: string; userId: string },
          any,
          Name
        >;
        listThreadArtifacts: FunctionReference<
          "query",
          "internal",
          { threadId: string; userId: string },
          any,
          Name
        >;
        listThreads: FunctionReference<
          "query",
          "internal",
          {
            boardId?: string;
            orgId?: string;
            userId: string;
            workspaceId?: string;
          },
          any,
          Name
        >;
        listWorkspaceThreads: FunctionReference<
          "query",
          "internal",
          { userId: string; workspaceId: string },
          any,
          Name
        >;
        saveConversationMessage: FunctionReference<
          "mutation",
          "internal",
          {
            content: string;
            metadata?: any;
            projectId: string;
            role: "user" | "assistant";
          },
          any,
          Name
        >;
        sendThreadMessage: FunctionReference<
          "mutation",
          "internal",
          {
            content: string;
            metadata?: {
              data?: any;
              generationTime?: number;
              sessionLogs?: any;
              thinking?: any;
              type?:
                | "text"
                | "subagent"
                | "board_execution"
                | "frame_preview"
                | "artifact"
                | "session_logs";
            };
            role: "user" | "assistant";
            threadId: string;
            userId: string;
          },
          any,
          Name
        >;
      };
      lifecycleSandbox: {
        appendSessionLogs: FunctionReference<
          "mutation",
          "internal",
          { logs: Array<string>; sessionId: string },
          any,
          Name
        >;
        cancelSession: FunctionReference<
          "action",
          "internal",
          { sessionId: string },
          any,
          Name
        >;
        cancelSessionMutation: FunctionReference<
          "mutation",
          "internal",
          { sessionId: string },
          any,
          Name
        >;
        completeFromForwarder: FunctionReference<
          "mutation",
          "internal",
          {
            messagesCount: number;
            output: string;
            sandboxId: string;
            sessionId: string;
            todos: Array<any>;
            toolCalls: Array<{ name: string; status?: string }>;
          },
          any,
          Name
        >;
        completeSandbox: FunctionReference<
          "mutation",
          "internal",
          {
            artifacts?: Array<any>;
            diffs?: Array<any>;
            error?: string;
            output: string;
            sessionId: string;
            todos?: Array<any>;
            toolCalls?: Array<any>;
          },
          any,
          Name
        >;
        create: FunctionReference<
          "mutation",
          "internal",
          { config?: any; projectId: string; secret?: string },
          any,
          Name
        >;
        createSession: FunctionReference<
          "mutation",
          "internal",
          { config?: any; projectId: string; secret?: string },
          any,
          Name
        >;
        get: FunctionReference<
          "query",
          "internal",
          { sessionId: string },
          any,
          Name
        >;
        getActiveSessionForCard: FunctionReference<
          "query",
          "internal",
          { cardId: string },
          any,
          Name
        >;
        getSession: FunctionReference<
          "query",
          "internal",
          { sessionId: string },
          any,
          Name
        >;
        getSessionDetails: FunctionReference<
          "query",
          "internal",
          { sessionId: string },
          any,
          Name
        >;
        getSessionMetrics: FunctionReference<
          "query",
          "internal",
          { sessionId: string },
          any,
          Name
        >;
        listSessions: FunctionReference<
          "query",
          "internal",
          { limit?: number; projectId: string },
          any,
          Name
        >;
        spawnSandbox: FunctionReference<
          "action",
          "internal",
          {
            boardId?: string;
            cardId?: string;
            deliverables?: Array<any>;
            fallbackModels?: Array<string>;
            maxTokens?: number;
            model?: string;
            projectId: string;
            prompt: string;
            runId?: string;
            sessionId: string;
            systemPrompt?: string;
            tools?: Array<string>;
            useOpenCode?: boolean;
          },
          any,
          Name
        >;
        startSession: FunctionReference<
          "action",
          "internal",
          { config?: any; projectId: string; prompt: string },
          any,
          Name
        >;
        updateSessionStatus: FunctionReference<
          "mutation",
          "internal",
          {
            error?: string;
            output?: any;
            sandboxId?: string;
            sessionId: string;
            status:
              | "pending"
              | "running"
              | "completed"
              | "failed"
              | "cancelled";
          },
          any,
          Name
        >;
      };
      sandboxConvex: {
        appendLogs: FunctionReference<
          "mutation",
          "internal",
          {
            logs: Array<
              | string
              | {
                  details?: string;
                  icon?: string;
                  label: string;
                  status?: string;
                  type: string;
                }
            >;
            sessionId: string;
          },
          any,
          Name
        >;
        cancelSession: FunctionReference<
          "action",
          "internal",
          { sessionId: string },
          any,
          Name
        >;
        createSession: FunctionReference<
          "mutation",
          "internal",
          { config?: any; projectId: string; prompt: string },
          any,
          Name
        >;
        getActiveSessionForCard: FunctionReference<
          "query",
          "internal",
          { cardId: string },
          any,
          Name
        >;
        getActiveSessionForThread: FunctionReference<
          "query",
          "internal",
          { threadId: string },
          any,
          Name
        >;
        getSession: FunctionReference<
          "query",
          "internal",
          { sessionId: string },
          any,
          Name
        >;
        getSessionWithLogs: FunctionReference<
          "query",
          "internal",
          { sessionId: string },
          any,
          Name
        >;
        listSessions: FunctionReference<
          "query",
          "internal",
          { limit?: number; projectId: string },
          any,
          Name
        >;
        startSession: FunctionReference<
          "action",
          "internal",
          { config?: any; projectId: string; prompt: string },
          any,
          Name
        >;
      };
    };
  };
