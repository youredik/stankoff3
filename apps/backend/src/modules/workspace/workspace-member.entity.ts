import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Workspace } from './workspace.entity';
import { User } from '../user/user.entity';
import { Role } from '../rbac/role.entity';

export enum WorkspaceRole {
  VIEWER = 'viewer',   // Только просмотр
  EDITOR = 'editor',   // Просмотр + редактирование заявок
  ADMIN = 'admin',     // Полный доступ к workspace (настройки, участники)
}

@Entity('workspace_members')
@Unique(['workspaceId', 'userId'])
export class WorkspaceMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  workspaceId: string;

  @Column()
  userId: string;

  /** @deprecated Используй roleId + workspaceRole. Оставлено для обратной совместимости до миграции 2. */
  @Column({
    type: 'enum',
    enum: WorkspaceRole,
    default: WorkspaceRole.EDITOR,
  })
  role: WorkspaceRole;

  @Column({ name: 'role_id', type: 'uuid', nullable: true })
  roleId: string | null;

  @ManyToOne(() => Role, { eager: false, nullable: true })
  @JoinColumn({ name: 'role_id' })
  workspaceRole: Role;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
