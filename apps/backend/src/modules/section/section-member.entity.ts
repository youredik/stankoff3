import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { Section } from './section.entity';
import { User } from '../user/user.entity';
import { Role } from '../rbac/role.entity';

export enum SectionRole {
  VIEWER = 'viewer', // Видит раздел и workspaces в нём
  ADMIN = 'admin', // Может редактировать раздел, управлять участниками
}

@Entity('section_members')
@Unique(['sectionId', 'userId'])
export class SectionMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sectionId: string;

  @Column()
  userId: string;

  /** @deprecated Используй roleId + sectionRole. Оставлено для обратной совместимости до миграции 2. */
  @Column({
    type: 'enum',
    enum: SectionRole,
    default: SectionRole.VIEWER,
  })
  role: SectionRole;

  @Column({ name: 'role_id', type: 'uuid', nullable: true })
  roleId: string | null;

  @ManyToOne(() => Role, { eager: false, nullable: true })
  @JoinColumn({ name: 'role_id' })
  sectionRole: Role;

  @ManyToOne(() => Section, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sectionId' })
  section: Section;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
