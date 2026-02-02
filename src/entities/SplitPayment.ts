import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm';
import { User } from './User';
import { SplitPaymentRecipient } from './SplitPaymentRecipient';
import { SplitPaymentExecution } from './SplitPaymentExecution';

export enum SplitPaymentStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    DELETED = 'deleted',
}

@Entity('split_payments')
export class SplitPayment {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    userId!: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user!: User;

    @Column({ type: 'varchar' })
    title!: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ type: 'varchar' })
    chain!: string;

    @Column({ type: 'varchar' })
    network!: string;

    @Column({ type: 'varchar' })
    currency!: string;

    @Column({ type: 'varchar' })
    fromAddress!: string;

    @Column('decimal', { precision: 20, scale: 8 })
    totalAmount!: string;

    @Column('integer')
    totalRecipients!: number;

    @Column({
        type: 'enum',
        enum: SplitPaymentStatus,
        default: SplitPaymentStatus.ACTIVE,
    })
    status!: SplitPaymentStatus;

    @Column('integer', { default: 0 })
    executionCount!: number;

    @Column({ type: 'timestamp', nullable: true })
    lastExecutedAt?: Date;

    @OneToMany(
        () => SplitPaymentRecipient,
        (recipient) => recipient.splitPayment,
        {
            cascade: true,
        }
    )
    recipients!: SplitPaymentRecipient[];

    @OneToMany(
        () => SplitPaymentExecution,
        (execution) => execution.splitPayment
    )
    executions!: SplitPaymentExecution[];

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
