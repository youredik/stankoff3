import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Workspace } from '../workspace/workspace.entity';

@Entity('product_categories')
@Index('idx_product_categories_workspace', ['workspaceId'])
@Index('idx_product_categories_parent', ['parentId'])
@Index('idx_product_categories_legacy', ['legacyId'], { unique: true, where: '"legacyId" IS NOT NULL' })
export class ProductCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  slug: string | null;

  @ManyToOne(() => ProductCategory, (cat) => cat.children, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentId' })
  parent: ProductCategory | null;

  @Column({ nullable: true })
  parentId: string | null;

  @OneToMany(() => ProductCategory, (cat) => cat.parent)
  children: ProductCategory[];

  @Column({ type: 'int', nullable: true })
  legacyId: number | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'int', default: 0 })
  productCount: number;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column()
  workspaceId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
