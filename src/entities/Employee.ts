import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from "typeorm";
import { Company } from "./Company";
import { User } from "./User";
import { KYCStatus } from "../types";

export enum EmploymentStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  ON_LEAVE = "on_leave",
  TERMINATED = "terminated",
}

@Entity("employees")
export class Employee {
  @PrimaryGeneratedColumn("uuid")
  id: string | undefined;

  // Reference to the user account
  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User | undefined;

  @Column({ type: 'uuid' })
  userId!: string;

  // Reference to the company
  @ManyToOne(() => Company, (company) => company.employees)
  @JoinColumn({ name: 'companyId' })
  company: Company | undefined;

  @Column({ type: 'uuid' })
  companyId!: string;

  // Company code for joining (denormalized for quick access)
  @Column({ type: 'text' })
  companyCode!: string;

  // Employee Details
  @Column({ nullable: true, type: 'text' })
  employeeId?: string; // Custom employee ID (e.g., EMP001)

  @Column({ type: 'text' })
  firstName!: string;

  @Column({ type: 'text' })
  lastName!: string;

  @Column({ nullable: true, type: 'text' })
  email?: string;

  @Column({ nullable: true, type: 'text' })
  phoneNumber?: string;

  @Column({ nullable: true, type: 'text' })
  position?: string;

  @Column({ nullable: true, type: 'text' })
  department?: string;

  // Salary Information
  @Column("decimal", { precision: 18, scale: 2, nullable: true })
  salary?: number;

  @Column({ default: "USD", type: 'text' })
  salaryCurrency!: string;

  // Wallet Information
  @Column({ nullable: true, type: 'text' })
  walletAddress?: string;

  @Column({ default: "solana", type: 'text' })
  preferredChain!: string;

  // Employment Status
  @Column({
    type: "enum",
    enum: EmploymentStatus,
    default: EmploymentStatus.ACTIVE,
  })
  employmentStatus!: EmploymentStatus;

  @Column({ type: "date", nullable: true })
  hireDate?: Date;

  @Column({ type: "date", nullable: true })
  terminationDate?: Date;

  // KYC Status (inherited from User but tracked here too)
  @Column({
    type: "enum",
    enum: KYCStatus,
    default: KYCStatus.PENDING,
  })
  kycStatus!: KYCStatus;

  // Payment Preferences
  @Column("simple-json", { nullable: true })
  paymentPreferences?: {
    usdc: number; // Percentage
    sol: number; // Percentage
    otherTokens?: { [key: string]: number };
  };

  // Metadata
  @Column({ default: true, type: 'boolean' })
  isActive!: boolean;

  @Column({ nullable: true, type: 'text' })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date | undefined;

  @UpdateDateColumn()
  updatedAt: Date | undefined;
}
