import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';
import { Transaction } from './Transaction';

@Entity('fees')
export class Fee {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar', nullable: true })
    userId!: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'userId' })
    user?: User;

    @Column({ type: 'varchar', nullable: true })
    transactionId?: string;

    @ManyToOne(() => Transaction, { nullable: true })
    @JoinColumn({ name: 'transactionId' })
    transaction?: Transaction;

    @Column({ type: 'decimal', precision: 18, scale: 8 })
    amount!: string;

    @Column({ type: 'decimal', precision: 18, scale: 8 })
    fee!: string;

    @Column({ type: 'decimal', precision: 18, scale: 8 })
    total!: string;

    @Column({ type: 'varchar', length: 50 })
    tier!: string;

    @Column({ type: 'decimal', precision: 8, scale: 4 })
    feePercentage!: string;

    @Column({ type: 'varchar', length: 50, default: 'normal_transaction' })
    feeType!: string; // 'normal_transaction', 'on_ramp', 'off_ramp', 'business_api'

    @Column({ type: 'varchar', length: 20, default: 'USD' })
    currency!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    chain?: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    network?: string;

    @CreateDateColumn()
    createdAt!: Date;

    @Column({ type: 'jsonb', nullable: true })
    metadata?: Record<string, any>;
}
