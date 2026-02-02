import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './User';

@Entity('refresh_tokens')
export class RefreshToken {
    @PrimaryGeneratedColumn('uuid')
    id: string | undefined;

    @Column({ type: 'text' })
    token: string | undefined;

    @Column({ type: 'timestamp' })
    expiresAt: Date | undefined;

    @Column({ type: 'boolean', default: false })
    isRevoked!: boolean;

    @ManyToOne(() => User, (user) => user.refreshTokens, {
        onDelete: 'CASCADE',
    })
    @JoinColumn()
    user: User | undefined;

    @Column({ type: 'uuid' })
    userId: string | undefined;

    @CreateDateColumn()
    createdAt: Date | undefined;
}
