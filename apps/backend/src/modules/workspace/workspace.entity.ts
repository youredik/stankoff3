import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { WorkspaceEntity } from '../entity/entity.entity';

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  icon: string;

  @Column('jsonb', { default: [] })
  sections: {
    id: string;
    name: string;
    fields: {
      id: string;
      name: string;
      type: 'text' | 'number' | 'date' | 'select' | 'status' | 'user' | 'file' | 'relation';
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
