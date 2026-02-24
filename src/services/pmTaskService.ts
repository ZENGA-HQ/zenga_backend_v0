import axios from "axios";
import { PMTaskPriority } from "../entities/PMTask";

export interface PMTaskDraft {
  title: string;
  description?: string;
  phase?: string;
  effortHours?: number;
  priority?: PMTaskPriority;
  dependencyTitles?: string[];
}

export interface PMTaskGenerationInput {
  goal: string;
  timeline?: string;
  priorityOrder?: string;
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export class PMTaskService {
  static async generateTasks(input: PMTaskGenerationInput): Promise<PMTaskDraft[]> {
    if (process.env.OPENAI_API_KEY) {
      try {
        const aiTasks = await this.generateTasksWithOpenAI(input);
        if (aiTasks.length > 0) {
          return aiTasks;
        }
      } catch (error) {
        console.error("[PMTaskService] OpenAI generation failed, using fallback:", error);
      }
    }

    return this.generateFallbackTasks(input);
  }

  private static async generateTasksWithOpenAI(
    input: PMTaskGenerationInput
  ): Promise<PMTaskDraft[]> {
    const prompt = this.buildPrompt(input);

    const response = await axios.post(
      OPENAI_URL,
      {
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are an expert product manager. Return ONLY valid JSON with key 'tasks'.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content);
    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      return [];
    }

    return parsed.tasks.map((task: any) => ({
      title: String(task.title || "Untitled task"),
      description: task.description ? String(task.description) : undefined,
      phase: task.phase ? String(task.phase) : undefined,
      effortHours: Number(task.effortHours || 0),
      priority: this.normalizePriority(task.priority),
      dependencyTitles: Array.isArray(task.dependencies)
        ? task.dependencies.map((dep: any) => String(dep))
        : undefined,
    }));
  }

  private static buildPrompt(input: PMTaskGenerationInput): string {
    const timeline = input.timeline ? `Timeline: ${input.timeline}` : "Timeline: not specified";
    const priority = input.priorityOrder
      ? `Priority order: ${input.priorityOrder}`
      : "Priority order: not specified";

    return [
      "Break the goal into 8-14 actionable tasks.",
      "Group tasks into phases: Discovery, Build, QA, Launch.",
      "Estimate effortHours (number), choose priority (low|medium|high).",
      "List dependencies by task title in 'dependencies'.",
      "Return JSON format: { \"tasks\": [ {\"title\":...,\"description\":...,\"phase\":...,\"effortHours\":...,\"priority\":...,\"dependencies\":[...] } ] }",
      `Goal: ${input.goal}`,
      timeline,
      priority,
    ].join("\n");
  }

  private static normalizePriority(value: any): PMTaskPriority {
    const text = String(value || "").toLowerCase();
    if (text === "high") return PMTaskPriority.HIGH;
    if (text === "low") return PMTaskPriority.LOW;
    return PMTaskPriority.MEDIUM;
  }

  private static generateFallbackTasks(input: PMTaskGenerationInput): PMTaskDraft[] {
    const baseTitle = input.goal || "Product goal";

    return [
      {
        title: `Clarify requirements for ${baseTitle}`,
        description: "Confirm scope, success metrics, and constraints.",
        phase: "Discovery",
        effortHours: 6,
        priority: PMTaskPriority.HIGH,
      },
      {
        title: "Design implementation plan",
        description: "Outline architecture and milestone breakdown.",
        phase: "Discovery",
        effortHours: 6,
        priority: PMTaskPriority.HIGH,
      },
      {
        title: "Create UI/UX drafts",
        description: "Build basic UI flow and component list.",
        phase: "Build",
        effortHours: 8,
        priority: PMTaskPriority.MEDIUM,
      },
      {
        title: "Implement backend endpoints",
        description: "Add required APIs and validation logic.",
        phase: "Build",
        effortHours: 12,
        priority: PMTaskPriority.HIGH,
        dependencyTitles: ["Design implementation plan"],
      },
      {
        title: "Implement frontend UI",
        description: "Build core screens and integrate API calls.",
        phase: "Build",
        effortHours: 12,
        priority: PMTaskPriority.HIGH,
        dependencyTitles: ["Create UI/UX drafts", "Implement backend endpoints"],
      },
      {
        title: "QA testing and fixes",
        description: "Run test cases and fix critical issues.",
        phase: "QA",
        effortHours: 8,
        priority: PMTaskPriority.MEDIUM,
        dependencyTitles: ["Implement frontend UI"],
      },
      {
        title: "Release planning",
        description: "Prepare release checklist and monitoring plan.",
        phase: "Launch",
        effortHours: 4,
        priority: PMTaskPriority.MEDIUM,
      },
    ];
  }
}
