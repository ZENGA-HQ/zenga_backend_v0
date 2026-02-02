import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './User';

@Entity('transactions')
export class Transaction {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    userId!: string;

    @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
    @JoinColumn()
    user!: User;

    @Column({ type: 'varchar' })
    type!: string; // 'send', 'receive', etc.

    @Column('decimal', { precision: 20, scale: 8 })
    amount!: number;

    @Column({ type: 'varchar' })
    chain!: string;

    @Column({ type: 'varchar', nullable: true })
    network?: string; // 'mainnet', 'testnet', etc.

    @Column({ type: 'varchar' })
    toAddress!: string;

    @Column({ type: 'varchar' })
    fromAddress!: string;

    @Column({ type: 'varchar' })
    txHash!: string;

    @Column('jsonb', { nullable: true })
    details?: any;

    @Column({ type: 'varchar', default: 'pending' })
    status!: 'pending' | 'confirmed' | 'failed';

    @Column('text', { nullable: true })
    error?: string;

    @CreateDateColumn()
    createdAt!: Date;
}