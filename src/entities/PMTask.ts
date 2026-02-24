import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { PMRoadmap } from "./PMRoadmap";
import { PMTaskAssignment } from "./PMTaskAssignment";

export enum PMTaskPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export enum PMTaskStatus {
  TODO = "todo",
  IN_PROGRESS = "in_progress",
  BLOCKED = "blocked",
  DONE = "done",
}

@Entity("pm_tasks")
export class PMTask {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  roadmapId!: string;

  @ManyToOne(() => PMRoadmap, (roadmap) => roadmap.tasks)
  @JoinColumn({ name: "roadmapId" })
  roadmap!: PMRoadmap;

  @Column({ type: "text" })
  title!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column("integer", { default: 0 })
  effortHours!: number;

  @Column({ type: "text", nullable: true })
  phase?: string;

  @Column("integer", { default: 0 })
  sortOrder!: number;

  @Column({ type: "jsonb", nullable: true })
  dependencyIds?: string[];

  @Column({
    type: "enum",
    enum: PMTaskPriority,
    default: PMTaskPriority.MEDIUM,
  })
  priority!: PMTaskPriority;

  @Column({
    type: "enum",
    enum: PMTaskStatus,
    default: PMTaskStatus.TODO,
  })
  status!: PMTaskStatus;

  @OneToMany(() => PMTaskAssignment, (assignment) => assignment.task, {
    cascade: true,
  })
  assignments!: PMTaskAssignment[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
