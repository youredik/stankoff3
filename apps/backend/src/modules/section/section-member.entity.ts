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

  @Column({
    type: 'enum',
    enum: SectionRole,
    default: SectionRole.VIEWER,
  })
  role: SectionRole;

  @ManyToOne(() => Section, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sectionId' })
  section: Section;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
