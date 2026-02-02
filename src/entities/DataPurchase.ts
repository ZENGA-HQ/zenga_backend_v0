// entities/DataPurchase.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';

// Define possible statuses for a data purchase
export enum DataPurchaseStatus {
    PENDING = 'pending',      // Waiting for crypto payment
    PROCESSING = 'processing', // Crypto received, processing data
    COMPLETED = 'completed',  // Data sent successfully
    FAILED = 'failed'         // Something went wrong
}

// Define supported mobile networks
export enum MobileNetwork {
    MTN = 'mtn',
    GLO = 'glo',
    AIRTEL = 'airtel',
    ETISALAT = '9mobile'
}

// Define supported blockchains
export enum Blockchain {
    ETHEREUM = 'ethereum',
    BITCOIN = 'bitcoin',
    SOLANA = 'solana',
    STELLAR = 'stellar',
    POLKADOT = 'polkadot',
    STARKNET = 'starknet',
    USDT_ERC20 = 'usdt-erc20'
}

@Entity('data_purchases')
export class DataPurchase {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    // Link to the user making the purchase
    @ManyToOne(() => User, user => user.id)
    @JoinColumn({ name: 'user_id' })
    user!: User;

    @Column({ type: 'uuid' })
    user_id!: string;

    // Network provider (MTN, GLO, etc.)
    @Column({
        type: 'enum',
        enum: MobileNetwork
    })
    network!: MobileNetwork;

    // Purchase status
    @Column({
        type: 'enum',
        enum: DataPurchaseStatus,
        default: DataPurchaseStatus.PENDING
    })
    status!: DataPurchaseStatus;

    // Data plan details from Nellobytes API
    @Column({ type: 'varchar' })
    plan_name!: string;

    @Column({ type: 'varchar' })
    dataplan_id!: string;  // This is what Nellobytes calls "DataPlan"

    // Which blockchain was used for payment
    @Column({ type: 'varchar' })
    blockchain!: string;

    // Crypto amount sent by user
    @Column({ type: 'decimal', precision: 20, scale: 8 })
    crypto_amount!: number;

    // Crypto currency (ETH, BTC, etc.)
    @Column({ type: 'varchar' })
    crypto_currency!: string;

    // Fiat amount in NGN (the actual price from Nellobytes)
    @Column({ type: 'decimal', precision: 12, scale: 2 })
    fiat_amount!: number;

    // Phone number receiving data
    @Column({ type: 'varchar' })
    phone_number!: string;

    // Blockchain transaction hash (when user sends crypto)
    @Column({ type: 'varchar', nullable: true })
    transaction_hash?: string;

    // Reference from Nellobytesystems API
    @Column({ type: 'varchar', nullable: true })
    provider_reference?: string;

    // Additional data like API responses, errors, etc.
    @Column({ type: 'jsonb', nullable: true })
    metadata?: any;

    // Automatic timestamps
    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}