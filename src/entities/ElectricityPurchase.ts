// entities/ElectricityPurchase.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';

// Define possible statuses for an electricity purchase
export enum ElectricityPurchaseStatus {
    PENDING = 'pending',         // Waiting for crypto payment
    PROCESSING = 'processing',   // Crypto received, processing payment
    COMPLETED = 'completed',     // Payment successful
    FAILED = 'failed'            // Something went wrong
}

// Define supported electricity companies
export enum ElectricityCompany {
    EKO_ELECTRIC = 'eko_electric',           // 01
    IKEJA_ELECTRIC = 'ikeja_electric',       // 02
    ABUJA_ELECTRIC = 'abuja_electric',       // 03
    KANO_ELECTRIC = 'kano_electric',         // 04
    PORTHARCOURT_ELECTRIC = 'portharcourt_electric', // 05
    JOS_ELECTRIC = 'jos_electric',           // 06
    IBADAN_ELECTRIC = 'ibadan_electric',     // 07
    KADUNA_ELECTRIC = 'kaduna_electric',     // 08
    ENUGU_ELECTRIC = 'enugu_electric',       // 09
    BENIN_ELECTRIC = 'benin_electric',       // 10
    YOLA_ELECTRIC = 'yola_electric',         // 11
    ABA_ELECTRIC = 'aba_electric'            // 12
}

// Define meter types
export enum MeterType {
    PREPAID = 'prepaid',   // 01
    POSTPAID = 'postpaid'  // 02
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

@Entity('electricity_purchases')
export class ElectricityPurchase {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    // Link to the user making the purchase
    @ManyToOne(() => User, user => user.id)
    @JoinColumn({ name: 'user_id' })
    user!: User;

    @Column({ type: 'uuid' })
    user_id!: string;

    // Electricity company
    @Column({
        type: 'enum',
        enum: ElectricityCompany
    })
    company!: ElectricityCompany;

    @Column({ type: 'varchar' })
    company_code!: string; // e.g., "01", "02"

    // Meter details
    @Column({
        type: 'enum',
        enum: MeterType
    })
    meter_type!: MeterType;

    @Column({ type: 'varchar' })
    meter_type_code!: string; // "01" for prepaid, "02" for postpaid

    @Column({ type: 'varchar' })
    meter_number!: string;

    // Phone number for notifications
    @Column({ type: 'varchar' })
    phone_number!: string;

    // Purchase status
    @Column({
        type: 'enum',
        enum: ElectricityPurchaseStatus,
        default: ElectricityPurchaseStatus.PENDING
    })
    status!: ElectricityPurchaseStatus;

    // Which blockchain was used for payment
    @Column({ type: 'varchar' })
    blockchain!: string;

    // Crypto amount sent by user
    @Column({ type: 'decimal', precision: 20, scale: 8 })
    crypto_amount!: number;

    // Crypto currency (ETH, BTC, etc.)
    @Column({ type: 'varchar' })
    crypto_currency!: string;

    // Fiat amount in NGN
    @Column({ type: 'decimal', precision: 12, scale: 2 })
    fiat_amount!: number;

    // Blockchain transaction hash (when user sends crypto)
    @Column({ type: 'varchar', nullable: true })
    transaction_hash?: string;

    // Reference from Nellobytesystems API
    @Column({ type: 'varchar', nullable: true })
    provider_reference?: string;

    // Meter token returned by provider
    @Column({ type: 'varchar', nullable: true })
    meter_token?: string;

    // Additional data like API responses, errors, etc.
    @Column({ type: 'jsonb', nullable: true })
    metadata?: any;

    // Automatic timestamps
    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}