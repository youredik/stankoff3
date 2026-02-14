import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ProductCategory } from './product-category.entity';

export interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string | null;
  parentId: string | null;
  legacyId: number | null;
  sortOrder: number;
  productCount: number;
  isActive: boolean;
  children: CategoryTreeNode[];
}

@Injectable()
export class ProductCategoryService {
  constructor(
    @InjectRepository(ProductCategory)
    private readonly repo: Repository<ProductCategory>,
  ) {}

  async findAll(workspaceId: string): Promise<ProductCategory[]> {
    return this.repo.find({
      where: { workspaceId, isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findTree(workspaceId: string): Promise<CategoryTreeNode[]> {
    const all = await this.findAll(workspaceId);
    return this.buildTree(all);
  }

  async findById(id: string): Promise<ProductCategory> {
    const cat = await this.repo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Категория не найдена');
    return cat;
  }

  async create(data: Partial<ProductCategory>): Promise<ProductCategory> {
    const cat = this.repo.create(data);
    return this.repo.save(cat);
  }

  async update(id: string, data: Partial<ProductCategory>): Promise<ProductCategory> {
    const cat = await this.findById(id);
    Object.assign(cat, data);
    return this.repo.save(cat);
  }

  async remove(id: string): Promise<void> {
    // Переносим дочерние категории к родителю удаляемой
    const cat = await this.findById(id);
    await this.repo.update({ parentId: id }, { parentId: cat.parentId });
    await this.repo.remove(cat);
  }

  /** Обновить productCount для всех категорий workspace */
  async recalculateCounts(workspaceId: string): Promise<void> {
    await this.repo.query(`
      UPDATE product_categories pc
      SET "productCount" = (
        SELECT COUNT(*)::int FROM entities e
        WHERE e."workspaceId" = pc."workspaceId"
          AND e.data->>'category' = pc.name
      )
      WHERE pc."workspaceId" = $1
    `, [workspaceId]);
  }

  /** Найти или создать категорию по legacy ID */
  async upsertFromLegacy(
    workspaceId: string,
    legacyId: number,
    name: string,
    parentLegacyId: number | null,
    slug: string | null,
    sortOrder: number,
  ): Promise<ProductCategory> {
    let cat = await this.repo.findOne({ where: { legacyId } });

    // Резолвим parent по legacy ID
    let parentId: string | null = null;
    if (parentLegacyId && parentLegacyId > 0) {
      const parentCat = await this.repo.findOne({ where: { legacyId: parentLegacyId } });
      if (parentCat) parentId = parentCat.id;
    }

    if (cat) {
      cat.name = name;
      cat.slug = slug;
      cat.parentId = parentId;
      cat.sortOrder = sortOrder;
      return this.repo.save(cat);
    }

    return this.repo.save(this.repo.create({
      workspaceId,
      legacyId,
      name,
      slug,
      parentId,
      sortOrder,
      isActive: true,
      productCount: 0,
    }));
  }

  private buildTree(categories: ProductCategory[]): CategoryTreeNode[] {
    const map = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    // Создаём узлы
    for (const cat of categories) {
      map.set(cat.id, {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        parentId: cat.parentId,
        legacyId: cat.legacyId,
        sortOrder: cat.sortOrder,
        productCount: cat.productCount,
        isActive: cat.isActive,
        children: [],
      });
    }

    // Строим дерево
    for (const node of map.values()) {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Сортируем на каждом уровне
    const sortNodes = (nodes: CategoryTreeNode[]) => {
      nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      nodes.forEach((n) => sortNodes(n.children));
    };
    sortNodes(roots);

    return roots;
  }
}
