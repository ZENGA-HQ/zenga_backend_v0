import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './User';
import { KYCStatus } from '../types';

@Entity('kyc_documents')
export class KYCDocument {
    @PrimaryGeneratedColumn('uuid')
    id: string | undefined;

    @Column({
        type: 'enum',
        enum: KYCStatus,
        default: KYCStatus.PENDING,
    })
    status: KYCStatus | undefined;

    @Column({ type: 'text', nullable: true })
    documentType?: string;

    @Column({ type: 'text', nullable: true })
    documentUrl?: string;

    @Column({ type: 'timestamp', nullable: true })
    submittedAt?: Date;

    @Column({ type: 'timestamp', nullable: true })
    reviewedAt?: Date;

    @Column({ type: 'text', nullable: true })
    rejectionReason?: string;

    @OneToOne(() => User, (user) => user.kycDocument)
    @JoinColumn()
    user: User | undefined;

    @Column({ type: 'uuid' })
    userId: string | undefined;

    @CreateDateColumn()
    createdAt: Date | undefined;

    @UpdateDateColumn()
    updatedAt: Date | undefined;
}
