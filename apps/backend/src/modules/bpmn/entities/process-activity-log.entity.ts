import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ProcessInstance } from './process-instance.entity';
import { ProcessDefinition } from './process-definition.entity';

@Entity('process_activity_logs')
@Index('idx_activity_log_definition', ['processDefinitionId'])
@Index('idx_activity_log_instance', ['processInstanceId'])
@Index('idx_activity_log_element', ['processDefinitionId', 'elementId'])
export class ProcessActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  processInstanceId: string;

  @ManyToOne(() => ProcessInstance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processInstanceId' })
  processInstance: ProcessInstance;

  @Column({ type: 'uuid' })
  processDefinitionId: string;

  @ManyToOne(() => ProcessDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'processDefinitionId' })
  processDefinition: ProcessDefinition;

  @Column({ type: 'varchar', length: 255 })
  elementId: string;

  @Column({ type: 'varchar', length: 100 })
  elementType: string;

  @Column({ type: 'varchar', length: 20, default: 'success' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  workerType: string | null;
}
