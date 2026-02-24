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
import { Company } from "./Company";
import { PMTask } from "./PMTask";

export enum PMRoadmapStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  ARCHIVED = "archived",
}

@Entity("pm_roadmaps")
export class PMRoadmap {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  companyId!: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: "companyId" })
  company!: Company;

  @Column({ type: "text" })
  goal!: string;

  @Column({ type: "text", nullable: true })
  timeline?: string;

  @Column({ type: "text", nullable: true })
  priorityOrder?: string;

  @Column({ type: "text", default: "chat" })
  source!: string;

  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, unknown>;

  @Column({
    type: "enum",
    enum: PMRoadmapStatus,
    default: PMRoadmapStatus.DRAFT,
  })
  status!: PMRoadmapStatus;

  @OneToMany(() => PMTask, (task) => task.roadmap, { cascade: true })
  tasks!: PMTask[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
