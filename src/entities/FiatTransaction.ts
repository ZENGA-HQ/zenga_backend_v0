import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User';

@Entity('fiat_transactions')
export class FiatTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'decimal', precision: 20, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar' })
  reference!: string;

  @Column({ type: 'boolean', default: false })
  settled?: boolean;

  @Column({ type: 'varchar' })
  crypto!: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'success', 'failed'],
    default: 'pending',
  })
  status!: 'pending' | 'success' | 'failed';

  @Column({ type: 'varchar', nullable: true })
  paymentDescription?: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
