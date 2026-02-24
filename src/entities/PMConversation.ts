import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Company } from "./Company";
import { User } from "./User";

@Entity("pm_conversations")
export class PMConversation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  companyId!: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: "companyId" })
  company!: Company;

  @Column({ type: "uuid", nullable: true })
  userId?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user?: User;

  @Column({ type: "jsonb", default: () => "'[]'" })
  messages!: Array<{ role: string; content: string; timestamp?: string }>;

  @Column({ type: "jsonb", nullable: true })
  context?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
