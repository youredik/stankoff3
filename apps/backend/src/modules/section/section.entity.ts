import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Workspace } from '../workspace/workspace.entity';
import { SectionMember } from './section-member.entity';

@Entity('sections')
export class Section {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ default: '📁' })
  icon: string;

  @Column({ default: 0 })
  order: number;

  @OneToMany(() => Workspace, (workspace) => workspace.section)
  workspaces: Workspace[];

  @OneToMany(() => SectionMember, (member) => member.section)
  members: SectionMember[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
