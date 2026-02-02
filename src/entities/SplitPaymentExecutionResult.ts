import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { SplitPaymentExecution } from './SplitPaymentExecution';

export enum PaymentResultStatus {
    PENDING = 'pending',
    SUCCESS = 'success',
    FAILED = 'failed',
}

@Entity('split_payment_execution_results')
export class SplitPaymentExecutionResult {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    executionId!: string;

    @ManyToOne(() => SplitPaymentExecution, (execution) => execution.results)
    @JoinColumn({ name: 'executionId' })
    execution!: SplitPaymentExecution;

    @Column({ type: 'varchar' })
    recipientAddress!: string;

    @Column({ type: 'varchar', nullable: true })
    recipientName?: string | null;

    @Column({ type: 'varchar', nullable: true })
    recipientEmail?: string | null;

    @Column('decimal', { precision: 20, scale: 8 })
    amount!: string;

    @Column({
        type: 'enum',
        enum: PaymentResultStatus,
        default: PaymentResultStatus.PENDING,
    })
    status!: PaymentResultStatus;

    @Column({ type: 'varchar', nullable: true })
    txHash?: string | null;

    @Column('decimal', { precision: 20, scale: 8, nullable: true })
    fees?: string | null;

    @Column('text', { nullable: true })
    errorMessage?: string | null;

    @CreateDateColumn()
    createdAt!: Date;

    @Column({ type: 'timestamp', nullable: true })
    processedAt?: Date | null;
}
