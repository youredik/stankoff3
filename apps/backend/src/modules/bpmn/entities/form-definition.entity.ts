import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Workspace } from '../../workspace/workspace.entity';
import { User } from '../../user/user.entity';

export interface FormSchema {
  $id?: string;
  type: 'object';
  title?: string;
  description?: string;
  required?: string[];
  properties: Record<string, FormFieldSchema>;
}

export interface FormFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  title?: string;
  description?: string;
  default?: any;
  format?: 'date' | 'date-time' | 'email' | 'uri' | 'textarea' | 'richtext';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  enum?: any[];
  enumNames?: string[];
  items?: FormFieldSchema;
  minItems?: number;
  maxItems?: number;
  'x-component'?: string;
  'x-options'?: Record<string, any>;
}

export interface FormUISchema {
  'ui:order'?: string[];
  [fieldName: string]: {
    'ui:widget'?: string;
    'ui:placeholder'?: string;
    'ui:help'?: string;
    'ui:disabled'?: boolean;
    'ui:hidden'?: boolean;
    'ui:options'?: Record<string, any>;
  } | string[] | undefined;
}

@Entity('form_definitions')
@Unique(['workspaceId', 'key'])
export class FormDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // NULL = global form available to all workspaces
  @Column({ type: 'uuid', nullable: true })
  workspaceId: string | null;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb' })
  schema: FormSchema;

  @Column({ type: 'jsonb', nullable: true })
  uiSchema: FormUISchema | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
