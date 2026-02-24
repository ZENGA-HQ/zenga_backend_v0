import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { PMPlanningController } from "../controllers/pmPlanningController";

const router = Router();

/**
 * @swagger
 * /pm/conversations:
 *   post:
 *     tags: [PM]
 *     summary: Start PM planning conversation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [goal]
 *             properties:
 *               goal:
 *                 type: string
 *                 example: "Complete dashboard and admin section this week"
 *     responses:
 *       200:
 *         description: Conversation started
 */
router.post("/conversations", authMiddleware, PMPlanningController.startConversation);

/**
 * @swagger
 * /pm/conversations/{conversationId}/messages:
 *   post:
 *     tags: [PM]
 *     summary: Add a message to a PM conversation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *         required: true
 *         description: Conversation ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *                 example: "This week, dashboard first"
 *     responses:
 *       200:
 *         description: Message received
 */
router.post(
  "/conversations/:conversationId/messages",
  authMiddleware,
  PMPlanningController.addMessage
);

/**
 * @swagger
 * /pm/tasks/generate:
 *   post:
 *     tags: [PM]
 *     summary: Generate tasks from goal or conversation context
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               goal:
 *                 type: string
 *                 example: "Complete dashboard and admin section"
 *               timeline:
 *                 type: string
 *                 example: "this week"
 *               priorityOrder:
 *                 type: string
 *                 example: "dashboard_first"
 *               conversationId:
 *                 type: string
 *                 example: "b5d2b6d8-6f06-4b7b-8b16-0a2c2e98a7f1"
 *     responses:
 *       200:
 *         description: Tasks generated
 */
router.post("/tasks/generate", authMiddleware, PMPlanningController.generateTasks);

export default router;
