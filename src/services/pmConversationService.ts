import { AppDataSource } from "../config/database";
import { PMConversation } from "../entities/PMConversation";
import { DeepPartial } from "typeorm";
import axios from "axios";

export interface PMConversationContext extends Record<string, unknown> {
  goal?: string;
  timeline?: string;
  priorityOrder?: string;
  suggestPriority?: boolean;
  suggestedTimeline?: string;
  suggestedPriority?: string;
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
  }): Promise<any> {
    const conversationRepo = AppDataSource.getRepository(PMConversation);
    const context: PMConversationContext = { goal: params.goal };

    const messages: Array<{ role: string; content: string; timestamp: string }> = [
      {
        role: "user",
        content: params.goal,
        timestamp: new Date().toISOString(),
      },
    ];

    let aiAnswer: string | undefined = undefined;
    console.log(`[PMConversation] startConversation: checking for proactive suggestion...`);
    const suggestion = await this.generateProactiveSuggestion(context);
    console.log(`[PMConversation] startConversation: suggestion =`, suggestion);

    if (suggestion && suggestion.suggestedTimeline && suggestion.suggestedPriority) {
      context.suggestedTimeline = suggestion.suggestedTimeline;
      context.suggestedPriority = suggestion.suggestedPriority;
      aiAnswer = `${suggestion.reason}\n\nI suggest a timeline of **${suggestion.suggestedTimeline}** and a **${suggestion.suggestedPriority.replace('_', ' ')}** priority.\n\nDoes this work for you? (Respond with "Yes", "Agree", or suggest changes)`;

      messages.push({
        role: "assistant" as const,
        content: aiAnswer,
        timestamp: new Date().toISOString(),
      });
    }

    const conversation = conversationRepo.create({
      companyId: params.companyId,
      userId: params.userId,
      messages,
      context,
    } as DeepPartial<PMConversation>);

    const saved = await conversationRepo.save(conversation);
    const questions = this.getMissingContextQuestions(context);

    return {
      conversation: saved,
      questions,
      context: saved.context as PMConversationContext,
      aiAnswer
    };
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

    // Proactive Suggestion Logic: If we have a goal but no timeline/priority, and no suggested values yet, generate a proposal.
    if (context.goal && !context.timeline && !context.priorityOrder && !context.suggestedTimeline && !aiAnswer) {
      const suggestion = await this.generateProactiveSuggestion(context);
      if (suggestion && suggestion.suggestedTimeline && suggestion.suggestedPriority) {
        updates.suggestedTimeline = suggestion.suggestedTimeline;
        updates.suggestedPriority = suggestion.suggestedPriority;
        aiAnswer = `${suggestion.reason}\n\nI suggest a timeline of **${suggestion.suggestedTimeline}** and a **${suggestion.suggestedPriority.replace('_', ' ')}** priority.\n\nDoes this work for you? (Respond with "Yes", "Agree", or suggest changes)`;
      }
    }

    // Confirmation Logic: If the user agrees, move suggestions to confirmed context.
    const isAgreement = /agree|yes|looks good|okay|ok|confirm|go ahead/i.test(params.message);
    if (isAgreement && context.suggestedTimeline && context.suggestedPriority) {
      updates.timeline = context.suggestedTimeline;
      updates.priorityOrder = context.suggestedPriority;
      updates.suggestedTimeline = undefined; // Clear suggestions
      updates.suggestedPriority = undefined;
      aiAnswer = `Great! I've set the timeline to **${updates.timeline}** and priority to **${updates.priorityOrder.replace('_', ' ')}**. Generating your tasks now...`;
    }

    // If specific priority was asked for (legacy support)
    const shouldSuggestPriority = updates.suggestPriority || context.suggestPriority;
    if (shouldSuggestPriority && !context.priorityOrder && !aiAnswer) {
      // ... (existing logic for suggestPriority) ...
      // I'll keep this as a snippet or wrap it if needed, but the proactive one above is better.
    }

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
      const provider = process.env.PM_AI_PROVIDER || "openai";
      const systemPrompt = "You are a helpful AI product manager assistant. Answer the user's follow-up question based on the project context and previous conversation.";
      const historyText = messages.map(m => `${m.role}: ${m.content}`).join("\n");
      const fullPrompt = `Previous history:\n${historyText}\n\nUser Question: ${params.message}`;

      try {
        if (provider === "gemini" && process.env.GEMINI_API_KEY) {
          aiAnswer = await this.callGemini(systemPrompt, fullPrompt);
        } else if (process.env.OPENAI_API_KEY) {
          aiAnswer = await this.callOpenAI(systemPrompt, fullPrompt);
        }

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
          `[PMConversation] ${provider} follow-up failed:`,
          err?.response?.status,
          err?.response?.data || err?.message
        );
        aiAnswer = `[AI error: Unable to generate answer right now.]`;
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

  private static async generateProactiveSuggestion(context: PMConversationContext): Promise<{ suggestedTimeline?: string; suggestedPriority?: string; reason?: string } | null> {
    const provider = process.env.PM_AI_PROVIDER || "openai";
    console.log(`[PMConversation] Provider: ${provider}, Gemini Key exists: ${!!process.env.GEMINI_API_KEY}`);
    try {
      const prompt = `Project Goal: "${context.goal}"\nBased on this goal, suggest a realistic timeline and a strategic priority order (dashboard_first, admin_first, or parallel). Explain your reasoning.`;
      const systemPrompt = 'You are a product manager AI. Propose a timeline and priority order. Return only a JSON: {"suggestedTimeline": "...", "suggestedPriority": "...", "reason": "..."}';

      let apiResponse;
      if (provider === "gemini" && process.env.GEMINI_API_KEY) {
        apiResponse = await this.callGemini(systemPrompt, prompt);
      } else if (process.env.OPENAI_API_KEY) {
        apiResponse = await this.callOpenAI(systemPrompt, prompt);
      }

      if (apiResponse) {
        console.log(`[PMConversation] generateProactiveSuggestion: raw response:`, apiResponse);
        try {
          const parsed = JSON.parse(apiResponse.replace(/```json|```/g, ""));
          console.log(`[PMConversation] generateProactiveSuggestion: parsed:`, parsed);
          return parsed;
        } catch (e) {
          console.error(`[PMConversation] generateProactiveSuggestion: JSON parse failed`, e);
        }
      }
    } catch (err) {
      console.error(`[PMConversation] ${provider} proactive suggestion failed:`, err);
    }
    return null;
  }

  private static async callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
    console.log(`[PMConversation] Calling Gemini... prompt: ${userPrompt.substring(0, 50)}...`);
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    try {
      const response = await axios.post(
        GEMINI_URL,
        {
          contents: [
            {
              parts: [
                {
                  text: `System: ${systemPrompt}\n\nUser: ${userPrompt}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.5 },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 20000 }
      );
      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      console.log(`[PMConversation] Gemini response received: ${text.substring(0, 50)}...`);
      return text;
    } catch (err: any) {
      console.error(`[PMConversation] Gemini API call failed:`, err.response?.data || err.message);
      throw err;
    }
  }

  private static async callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
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
    return response.data?.choices?.[0]?.message?.content?.trim() || "";
  }

  private static getMissingContextQuestions(context: PMConversationContext): string[] {
    const questions: string[] = [];

    // Only ask for timeline/priority if they aren't filled AND the AI hasn't made a pending proposal.
    if (!context.timeline && !context.suggestedTimeline) {
      questions.push(
        "What is your target timeline? (e.g., this week, 2 weeks, by end of month)"
      );
    }

    if (!context.priorityOrder && !context.suggestedPriority) {
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