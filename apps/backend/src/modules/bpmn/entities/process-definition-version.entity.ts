import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ProcessDefinition } from './process-definition.entity';
import { User } from '../../user/user.entity';

@Entity('process_definition_versions')
@Index('idx_pdv_definition_version', ['processDefinitionId', 'version'], { unique: true })
export class ProcessDefinitionVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  processDefinitionId: string;

  @ManyToOne(() => ProcessDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processDefinitionId' })
  processDefinition: ProcessDefinition;

  @Column()
  version: number;

  @Column({ type: 'text' })
  bpmnXml: string;

  @Column({ nullable: true })
  deployedKey: string;

  @Column({ nullable: true })
  deployedById: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'deployedById' })
  deployedBy: User;

  @Column({ type: 'text', nullable: true })
  changelog: string;

  @CreateDateColumn()
  deployedAt: Date;
}
