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
import { PMTask } from "./PMTask";
import { Employee } from "./Employee";
import { User } from "./User";
import { PMTaskAssignmentComplaint } from "./PMTaskAssignmentComplaint";

export enum PMTaskAssignmentStatus {
  ASSIGNED = "assigned",
  ACCEPTED = "accepted",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  DISPUTED = "disputed",
}

@Entity("pm_task_assignments")
export class PMTaskAssignment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  taskId!: string;

  @ManyToOne(() => PMTask, (task) => task.assignments)
  @JoinColumn({ name: "taskId" })
  task!: PMTask;

  @Column({ type: "uuid" })
  employeeId!: string;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: "employeeId" })
  employee!: Employee;

  @Column({ type: "uuid", nullable: true })
  assignedByUserId?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: "assignedByUserId" })
  assignedByUser?: User;

  @Column({ type: "text", nullable: true })
  reason?: string;

  @Column({
    type: "enum",
    enum: PMTaskAssignmentStatus,
    default: PMTaskAssignmentStatus.ASSIGNED,
  })
  status!: PMTaskAssignmentStatus;

  @OneToMany(
    () => PMTaskAssignmentComplaint,
    (complaint) => complaint.assignment,
    { cascade: true }
  )
  complaints!: PMTaskAssignmentComplaint[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
