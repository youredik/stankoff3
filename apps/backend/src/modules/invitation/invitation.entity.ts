import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

export interface InvitationMembership {
  type: 'section' | 'workspace';
  targetId: string;
  roleSlug: string;
}

@Entity('invitations')
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  @Index()
  email: string;

  @Column({ name: 'token_hash', length: 64, unique: true })
  tokenHash: string;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.PENDING,
  })
  @Index()
  status: InvitationStatus;

  @Column({ name: 'first_name', type: 'varchar', length: 255, nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 255, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  department: string | null;

  @Column({ name: 'global_role_slug', length: 100, default: 'employee' })
  globalRoleSlug: string;

  @Column({ type: 'jsonb', default: '[]' })
  memberships: InvitationMembership[];

  @Column({ name: 'invited_by_id' })
  invitedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'invited_by_id' })
  invitedBy: User;

  @Column({ name: 'accepted_by_id', type: 'uuid', nullable: true })
  acceptedById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'accepted_by_id' })
  acceptedBy: User;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
