/**
 * Agent Mail - Simple inter-agent messaging
 * 
 * Used for:
 * - Beads notifications
 * - Agent-to-agent communication
 * - Async task handoffs
 */

import { v } from "convex/values";
import { action, query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

/** Send a message to a recipient */
export const send = action({
  args: {
    recipientId: v.string(),
    messageType: v.string(),
    payload: v.any(),
    ttlMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.runMutation(internal.mail.sendInternal, {
      senderId: "system",
      recipientId: args.recipientId,
      messageType: args.messageType,
      payload: args.payload,
      expiresAt: args.ttlMs ? Date.now() + args.ttlMs : undefined,
    });
    return { success: true, mailId: id };
  },
});

/** Internal mutation to insert mail */
export const sendInternal = internalMutation({
  args: {
    senderId: v.string(),
    recipientId: v.string(),
    messageType: v.string(),
    payload: v.any(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agentMail", {
      senderId: args.senderId,
      recipientId: args.recipientId,
      messageType: args.messageType,
      payload: args.payload,
      read: false,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
  },
});

/** Get inbox messages for current recipient */
export const inbox = action({
  args: {
    recipientId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.runQuery(internal.mail.listMessages, {
      recipientId: args.recipientId || "anonymous",
      limit: args.limit || 50,
    });
    return { messages };
  },
});

/** List messages query */
export const listMessages = internalQuery({
  args: {
    recipientId: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentMail")
      .withIndex("by_recipient", (q) => q.eq("recipientId", args.recipientId))
      .order("desc")
      .take(args.limit);
  },
});

/** Mark message as read */
export const markRead = mutation({
  args: { mailId: v.id("agentMail") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mailId, { read: true });
  },
});
