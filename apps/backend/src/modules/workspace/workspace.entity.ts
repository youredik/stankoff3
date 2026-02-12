import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WorkspaceEntity } from '../entity/entity.entity';
import { WorkspaceMember } from './workspace-member.entity';
import { Section } from '../section/section.entity';

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

  @Column({ default: false })
  isArchived: boolean; // Архивирован ли workspace

  @Column({ default: false })
  isInternal: boolean; // Внутренний workspace (не отображается в UI, используется для AI/RAG)

  @Column({ default: false })
  isSystem: boolean; // Системный workspace (справочник: контрагенты, контакты, товары)

  @Column({ type: 'varchar', length: 30, nullable: true, default: null })
  systemType: string | null; // 'counterparties' | 'contacts' | 'products' | null

  @Column({ type: 'uuid', nullable: true })
  sectionId: string | null; // FK на раздел (может быть без раздела)

  @Column({ default: true })
  showInMenu: boolean; // Показывать в боковом меню

  @Column({ default: 0 })
  orderInSection: number; // Порядок внутри раздела

  @ManyToOne(() => Section, (section) => section.workspaces, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sectionId' })
  section: Section | null;

  @Column('jsonb', { default: [] })
  sections: {
    id: string;
    name: string;
    fields: {
      id: string;
      name: string;
      type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'status' | 'user' | 'file' | 'relation' | 'checkbox' | 'url' | 'geolocation' | 'client';
      required?: boolean;
      options?: { id: string; label: string; color?: string; parentId?: string }[];
      defaultValue?: any;
      description?: string;
      relatedWorkspaceId?: string;
      config?: Record<string, any>;
      rules?: { id: string; type: string; condition: Record<string, any>; action: Record<string, any> }[];
      system?: boolean; // Системное поле (нельзя удалить)
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
