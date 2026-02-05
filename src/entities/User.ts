import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
  ManyToOne,
} from "typeorm";
import { IsEmail, MinLength } from "class-validator";
import bcrypt from "bcryptjs";
import { UserAddress } from "./UserAddress";
import { KYCDocument } from "./KYCDocument";
import { RefreshToken } from "./RefreshToken";
import { Company } from "./Company";
import { KYCStatus } from "../types";

export enum UserType {
  COMPANY = "company",
  EMPLOYEE = "employee",
  INDIVIDUAL = "individual",
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string | undefined;

  @Column({ type: 'text', unique: true, nullable: true })
  @IsEmail()
  email?: string;

  @Column({ type: 'text', nullable: true })
  @MinLength(6)
  password?: string;

  @Column({
    type: "enum",
    enum: UserType,
    default: UserType.INDIVIDUAL,
  })
  userType!: UserType;

  @ManyToOne(() => Company, (company) => company.employees, { nullable: true })
  company?: Company;

  @Column({ type: 'text', nullable: true })
  companyId?: string | null;

  @Column({ type: 'text', nullable: true })
  firstName?: string;

  @Column({ type: 'text', nullable: true })
  lastName?: string;

  @Column({ type: 'text', nullable: true })
  phoneNumber?: string;

  @Column({ type: 'text', unique: true, nullable: true })
  username?: string;

  @Column({ type: 'text', nullable: true })
  displayPicture?: string;

  @Column({ type: 'text', nullable: true })
  bankName?: string;

  @Column({ type: 'text', nullable: true })
  accountNumber?: string;

  @Column({ type: 'text', nullable: true })
  accountName?: string;

  @Column({ type: 'text', nullable: true })
  position?: string;

  @Column("decimal", { precision: 18, scale: 2, nullable: true })
  salary?: number;

  @Column({ type: 'boolean', default: false })
  isEmailVerified!: boolean;

  @Column("decimal", { precision: 18, scale: 8, default: 0 })
  usdtBalance!: number;

  // Balances for other supported tokens (application-level ledger)
  @Column("decimal", { precision: 30, scale: 18, default: 0 })
  ethBalance!: number;

  @Column("decimal", { precision: 30, scale: 18, default: 0 })
  strkBalance!: number;

  @Column("decimal", { precision: 30, scale: 18, default: 0 })
  solBalance!: number;

  @Column("decimal", { precision: 30, scale: 8, default: 0 })
  btcBalance!: number;

  @Column("decimal", { precision: 30, scale: 7, default: 0 })
  xlmBalance!: number;

  @Column("decimal", { precision: 30, scale: 10, default: 0 })
  dotBalance!: number;

  @Column({ type: 'text', nullable: true })
  emailOTP?: string | null;

  @Column({ type: "timestamp", nullable: true })
  emailOTPExpiry?: Date | null;

  @Column({ type: 'text', nullable: true })
  phoneOTP?: string;

  @Column({ type: "timestamp", nullable: true })
  phoneOTPExpiry?: Date;

  @Column({ type: 'text', nullable: true })
  passwordResetToken?: string | null;

  @Column({ type: "timestamp", nullable: true })
  passwordResetExpiry?: Date | null;

  @Column({
    type: "enum",
    enum: KYCStatus,
    default: KYCStatus.PENDING,
  })
  kycStatus: KYCStatus | undefined;

  @OneToMany(() => UserAddress, (address) => address.user, { cascade: true })
  addresses: UserAddress[] | undefined;

  @OneToOne(() => KYCDocument, (kyc) => kyc.user, { cascade: true })
  @JoinColumn()
  kycDocument?: KYCDocument;

  @OneToMany(() => RefreshToken, (token) => token.user, { cascade: true })
  refreshTokens: RefreshToken[] | undefined;

  @CreateDateColumn()
  createdAt: Date | undefined;

  @UpdateDateColumn()
  updatedAt: Date | undefined;

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (
      this.password &&
      !this.password.startsWith("$2a$") &&
      !this.password.startsWith("$2b$")
    ) {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
    }
    // Ensure transaction PIN is hashed as well when present
    try {
      await this.hashTransactionPinIfNeeded();
    } catch (err) {
      console.error("Failed to hash transaction PIN:", err);
    }
  }

  /**
   * Transaction PIN: stored hashed for security. Expect a 4-digit numeric PIN.
   */
  @Column({ type: 'text', nullable: true })
  transactionPin?: string;

  /**
   * Hash transaction PIN similarly to the password when set/updated.
   */
  async hashTransactionPinIfNeeded() {
    if (
      this.transactionPin &&
      !this.transactionPin.startsWith("$2a$") &&
      !this.transactionPin.startsWith("$2b$")
    ) {
      const salt = await bcrypt.genSalt(12);
      this.transactionPin = await bcrypt.hash(this.transactionPin, salt);
    }
  }

  async comparePassword(candidatePassword: string): Promise<boolean> {
    if (!this.password) {
      return false;
    }
    return await bcrypt.compare(candidatePassword, this.password);
  }
}
