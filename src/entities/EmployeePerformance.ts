import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { Employee } from "./Employee";

export enum BurnoutRiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

@Entity("employee_performance")
export class EmployeePerformance {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  employeeId!: string;

  @OneToOne(() => Employee)
  @JoinColumn({ name: "employeeId" })
  employee!: Employee;

  @Column({ type: "text", nullable: true })
  role?: string;

  @Column("integer", { default: 0 })
  successRate!: number;

  @Column("integer", { default: 0 })
  onTimeRate!: number;

  @Column("integer", { default: 0 })
  currentLoad!: number;

  @Column("integer", { default: 0 })
  velocityWeekly!: number;

  @Column("integer", { default: 0 })
  velocitySprint!: number;

  @Column("integer", { default: 0 })
  avgCycleTimeHours!: number;

  @Column({
    type: "enum",
    enum: BurnoutRiskLevel,
    default: BurnoutRiskLevel.LOW,
  })
  burnoutRisk!: BurnoutRiskLevel;

  @Column({ type: "jsonb", nullable: true })
  strengths?: string[];

  @Column({ type: "jsonb", nullable: true })
  weaknesses?: string[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
