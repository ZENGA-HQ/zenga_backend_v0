import { AppDataSource } from "../config/database";
import { PMConversation } from "../entities/PMConversation";
import { DeepPartial } from "typeorm";
import axios from "axios";

export interface PMConversationContext extends Record<string, unknown> {
  goal?: string;
  timeline?: string;
  priorityOrder?: string;
  suggestPriority?: boolean; // FIX 1: Add to interface so TypeScript knows about it
}

export interface PMConversationResponse {
  conversation: PMConversation;
  questions: string[];
  context: PMConversationContext;
}

export class PMConversationService {
  private static readonly TIMELINE_PATTERNS: RegExp[] = [
    /\bthis week\b/i,
    /\bnext week\b/i,
    /\b\d+\s*(day|days|week|weeks|month|months)\b/i,
    /\bby\s+end\s+of\s+(month|quarter|year)\b/i,
  ];

  private static readonly PRIORITY_PATTERNS: Array<{ key: string; regex: RegExp }> = [
    { key: "dashboard_first", regex: /dashboard\s+first/i },
    { key: "admin_first", regex: /admin\s+first/i },
    { key: "parallel", regex: /parallel|both\s+in\s+parallel/i },
  ];

  static async startConversation(params: {
    companyId: string;
    userId?: string;
    goal: string;
  }): Promise<PMConversationResponse> {
    const conversationRepo = AppDataSource.getRepository(PMConversation);
    const context: PMConversationContext = { goal: params.goal };

    const conversation = conversationRepo.create({
      companyId: params.companyId,
      userId: params.userId,
      messages: [
        {
          role: "user",
          content: params.goal,
          timestamp: new Date().toISOString(),
        },
      ],
      context,
    } as DeepPartial<PMConversation>);

    const saved = await conversationRepo.save(conversation);
    const questions = this.getMissingContextQuestions(context);

    return { conversation: saved, questions, context };
  }

  static async addUserMessage(params: {
    conversationId: string;
    message: string;
  }): Promise<any> {
    const conversationRepo = AppDataSource.getRepository(PMConversation);
    const conversation = await conversationRepo.findOne({
      where: { id: params.conversationId },
    });

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const context = (conversation.context || {}) as PMConversationContext;
    const updates = this.parseContextFromMessage(params.message, context);

    const messages = [...(conversation.messages || [])];
    messages.push({
      role: "user",
      content: params.message,
      timestamp: new Date().toISOString(),
    });

    let aiAnswer: string | undefined = undefined;

    // FIX 2: Check both the new updates flag AND the persisted context flag
    const shouldSuggestPriority = updates.suggestPriority || context.suggestPriority;

    if (shouldSuggestPriority && !context.priorityOrder && process.env.OPENAI_API_KEY) {
      try {
        const prompt = `Given the project goal: "${context.goal}" and timeline: "${updates.timeline || context.timeline}", which should be the priority: dashboard, admin, or off ramping for payment? Reply with one of: dashboard_first, admin_first, or parallel, and a short reason.`;
        const response = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  'You are a product manager AI. Suggest the best priority order for the project and explain why. Only reply with a JSON: {"priorityOrder":..., "reason":...}',
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.5,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );

        const text = response.data.choices?.[0]?.message?.content?.trim();
        if (text) {
          try {
            const json = JSON.parse(text.replace(/```json|```/g, ""));
            if (json.priorityOrder) {
              // FIX 3: Write priorityOrder into updates so the context spread below picks it up
              updates.priorityOrder = json.priorityOrder;
              aiAnswer = json.reason || text;
            } else {
              aiAnswer = text;
            }
          } catch (e) {
            aiAnswer = text;
          }
        }
      } catch (err: any) {
        // FIX 1: Log the real error so you can see what's actually going wrong
        console.error(
          "[PMConversation] OpenAI priority suggestion failed:",
          err?.response?.status,
          err?.response?.data || err?.message
        );
        aiAnswer = `[AI error: ${err?.response?.data?.error?.message || err?.message || "Unable to suggest priority right now."}]`;
      }
    }

    // FIX 2: Always clear suggestPriority from context after processing it,
    // so the flag doesn't permanently pollute future turns.
    updates.suggestPriority = false;

    conversation.messages = messages;
    conversation.context = { ...context, ...updates };

    // If all context is filled and the user sends a follow-up, call OpenAI
    const allContextFilled =
      conversation.context.goal &&
      conversation.context.timeline &&
      conversation.context.priorityOrder;
    let questions: string[] = this.getMissingContextQuestions(
      conversation.context as PMConversationContext
    );

    if (
      allContextFilled &&
      questions.length === 0 &&
      params.message.trim().length > 0 &&
      !aiAnswer
    ) {
      const chatMessages = messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      }));
      chatMessages.push({ role: "user", content: params.message });

      if (process.env.OPENAI_API_KEY) {
        try {
          const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
              model: process.env.OPENAI_MODEL || "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a helpful AI product manager assistant. Answer the user's follow-up question based on the project context and previous conversation.",
                },
                ...chatMessages,
              ],
              temperature: 0.5,
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json",
              },
            }
          );
          aiAnswer = response.data.choices?.[0]?.message?.content?.trim();
          if (aiAnswer) {
            messages.push({
              role: "assistant",
              content: aiAnswer,
              timestamp: new Date().toISOString(),
            });
            conversation.messages = messages;
            await conversationRepo.save(conversation);
          }
        } catch (err: any) {
          console.error(
            "[PMConversation] OpenAI follow-up failed:",
            err?.response?.status,
            err?.response?.data || err?.message
          );
          aiAnswer = `[AI error: ${err?.response?.data?.error?.message || err?.message || "Unable to generate answer right now."}]`;
        }
      } else {
        aiAnswer = "[AI not configured: Set OPENAI_API_KEY in your environment.]";
      }
    }

    const saved = await conversationRepo.save(conversation);
    questions = this.getMissingContextQuestions(saved.context as PMConversationContext);

    return {
      conversation: saved,
      questions,
      context: saved.context as PMConversationContext,
      aiAnswer,
    };
  }

  private static getMissingContextQuestions(context: PMConversationContext): string[] {
    const questions: string[] = [];

    if (!context.timeline) {
      questions.push(
        "What is your target timeline? (e.g., this week, 2 weeks, by end of month)"
      );
    }

    if (!context.priorityOrder) {
      questions.push(
        "Which priority order should we use? (e.g., dashboard first, admin first, parallel)"
      );
    }

    return questions;
  }

  private static parseContextFromMessage(
    message: string,
    context: PMConversationContext
  ): PMConversationContext {
    const updates: PMConversationContext = {};

    if (!context.timeline) {
      for (const rx of this.TIMELINE_PATTERNS) {
        const match = message.match(rx);
        if (match) {
          updates.timeline = match[0].trim();
          break;
        }
      }
    }

    const priorityRegex =
      /you tell me|suggest|which.*priori[ot]i[sz]e?|what.*priori[ot]i[sz]e?|priori[ot]i[sz]e\b|priori[ot]y\b/i;
    if (!context.priorityOrder && priorityRegex.test(message)) {
      updates.suggestPriority = true;
    } else if (!context.priorityOrder) {
      const match = this.PRIORITY_PATTERNS.find((rule) => rule.regex.test(message));
      if (match) {
        updates.priorityOrder = match.key;
      }
    }

    return updates;
  }
}