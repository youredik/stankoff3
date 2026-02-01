import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { WorkspaceEntity } from '../entity/entity.entity';
import { WorkspaceMember } from './workspace-member.entity';

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  icon: string;

  @Column({ default: 'ID' })
  prefix: string; // Префикс для номеров заявок: TP, REK и т.д.

  @Column({ default: 0 })
  lastEntityNumber: number; // Последний использованный номер

  @Column('jsonb', { default: [] })
  sections: {
    id: string;
    name: string;
    fields: {
      id: string;
      name: string;
      type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'status' | 'user' | 'file' | 'relation';
      required?: boolean;
      options?: { id: string; label: string; color?: string }[];
      defaultValue?: any;
      description?: string;
      relatedWorkspaceId?: string;
    }[];
    order: number;
  }[];

  @OneToMany(() => WorkspaceEntity, (entity) => entity.workspace)
  entities: WorkspaceEntity[];

  @OneToMany(() => WorkspaceMember, (member) => member.workspace)
  members: WorkspaceMember[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
