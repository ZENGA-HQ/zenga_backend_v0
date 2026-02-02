import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm';
import { SplitPayment } from './SplitPayment';
import { SplitPaymentExecutionResult } from './SplitPaymentExecutionResult';

export enum ExecutionStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    PARTIALLY_FAILED = 'partially_failed',
    FAILED = 'failed',
}

@Entity('split_payment_executions')
export class SplitPaymentExecution {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    splitPaymentId!: string;

    @ManyToOne(() => SplitPayment, (splitPayment) => splitPayment.executions)
    @JoinColumn({ name: 'splitPaymentId' })
    splitPayment!: SplitPayment;

    @Column('decimal', { precision: 20, scale: 8 })
    totalAmount!: string;

    @Column('integer')
    totalRecipients!: number;

    @Column('integer', { default: 0 })
    successfulPayments!: number;

    @Column('integer', { default: 0 })
    failedPayments!: number;

    @Column({
        type: 'enum',
        enum: ExecutionStatus,
        default: ExecutionStatus.PENDING,
    })
    status!: ExecutionStatus;

    @Column('jsonb', { nullable: true })
    batchTxHashes?: string[];

    @Column('decimal', { precision: 20, scale: 8, nullable: true })
    totalFees?: string;

    @Column('text', { nullable: true })
    errorMessage?: string;

    @OneToMany(
        () => SplitPaymentExecutionResult,
        (result) => result.execution,
        {
            cascade: true,
        }
    )
    results!: SplitPaymentExecutionResult[];

    @CreateDateColumn()
    createdAt!: Date;

    @Column({ type: 'timestamp', nullable: true })
    completedAt?: Date;
}
