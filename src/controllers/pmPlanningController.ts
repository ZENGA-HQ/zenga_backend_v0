import { Response } from "express";
import { AppDataSource } from "../config/database";
import { PMConversation } from "../entities/PMConversation";
import { PMConversationService } from "../services/pmConversationService";
import { PMTaskService } from "../services/pmTaskService";
import { AuthRequest } from "../types";

export class PMPlanningController {
  static async startConversation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const companyId = req.user.companyId || req.user.company?.id;
      if (!companyId) {
        res.status(400).json({ error: "Company not found for user" });
        return;
      }

      const goal = String(req.body?.goal || "").trim();
      if (!goal) {
        res.status(400).json({ error: "Goal is required" });
        return;
      }

      const result = await PMConversationService.startConversation({
        companyId,
        userId: req.user.id,
        goal,
      });

      res.json({
        message: "Conversation started",
        conversationId: result.conversation.id,
        questions: result.questions,
        context: result.context,
      });
    } catch (error) {
      console.error("[PMPlanning] startConversation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async addMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const conversationId = String(req.params.conversationId || "").trim();
      if (!conversationId) {
        res.status(400).json({ error: "Conversation id is required" });
        return;
      }

      const message = String(req.body?.message || "").trim();
      if (!message) {
        res.status(400).json({ error: "Message is required" });
        return;
      }

      const result = await PMConversationService.addUserMessage({
        conversationId,
        message,
      });

      res.json({
        message: result.aiAnswer ? "AI answer" : "Message received",
        conversationId: result.conversation.id,
        questions: result.questions,
        context: result.context,
        aiAnswer: result.aiAnswer,
      });
    } catch (error) {
      console.error("[PMPlanning] addMessage error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async generateTasks(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { goal, timeline, priorityOrder, conversationId } = req.body || {};
      let resolvedGoal = goal;
      let resolvedTimeline = timeline;
      let resolvedPriority = priorityOrder;

      if (conversationId) {
        const conversationRepo = AppDataSource.getRepository(PMConversation);
        const conversation = await conversationRepo.findOne({
          where: { id: String(conversationId) },
        });

        if (!conversation) {
          res.status(404).json({ error: "Conversation not found" });
          return;
        }

        const context = (conversation.context || {}) as Record<string, any>;
        resolvedGoal = resolvedGoal || context.goal;
        resolvedTimeline = resolvedTimeline || context.timeline;
        resolvedPriority = resolvedPriority || context.priorityOrder;
      }

      if (!resolvedGoal) {
        res.status(400).json({ error: "Goal is required" });
        return;
      }

      const tasks = await PMTaskService.generateTasks({
        goal: String(resolvedGoal),
        timeline: resolvedTimeline ? String(resolvedTimeline) : undefined,
        priorityOrder: resolvedPriority ? String(resolvedPriority) : undefined,
      });

      res.json({
        message: "Tasks generated",
        tasks,
      });
    } catch (error) {
      console.error("[PMPlanning] generateTasks error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
