import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  BeforeInsert,
} from "typeorm";
import { User } from "./User";
import { Employee } from "./Employee";
import { randomBytes } from "crypto";

@Entity("companies")
export class Company {
  @PrimaryGeneratedColumn("uuid")
  id: string | undefined;

  @Column({ type: 'text' })
  companyName!: string;

  @Column({ type: 'text', unique: true })
  companyEmail!: string;

  @Column({ type: 'text', unique: true })
  companyCode!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => User, (user) => user.company)
  users: User[] | undefined;

  @OneToMany(() => Employee, (employee) => employee.company)
  employees: Employee[] | undefined;

  @CreateDateColumn()
  createdAt: Date | undefined;

  @UpdateDateColumn()
  updatedAt: Date | undefined;

  @BeforeInsert()
  generateCompanyCode() {
    if (!this.companyCode) {
      // Generate a unique 8-character alphanumeric code
      this.companyCode = this.generateUniqueCode();
    }
  }

  private generateUniqueCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    const bytes = randomBytes(8);

    for (let i = 0; i < 8; i++) {
      code += chars[bytes[i]! % chars.length];
    }

    return code;
  }
}
