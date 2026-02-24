import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { PMTaskAssignment } from "./PMTaskAssignment";
import { Employee } from "./Employee";

export enum PMTaskComplaintStatus {
  RAISED = "raised",
  UNDER_REVIEW = "under_review",
  RESOLVED = "resolved",
  REJECTED = "rejected",
}

@Entity("pm_task_assignment_complaints")
export class PMTaskAssignmentComplaint {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  assignmentId!: string;

  @ManyToOne(() => PMTaskAssignment, (assignment) => assignment.complaints)
  @JoinColumn({ name: "assignmentId" })
  assignment!: PMTaskAssignment;

  @Column({ type: "uuid" })
  employeeId!: string;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: "employeeId" })
  employee!: Employee;

  @Column({ type: "text" })
  reason!: string;

  @Column({ type: "text", nullable: true })
  details?: string;

  @Column({
    type: "enum",
    enum: PMTaskComplaintStatus,
    default: PMTaskComplaintStatus.RAISED,
  })
  status!: PMTaskComplaintStatus;

  @Column({ type: "text", nullable: true })
  resolutionNote?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
