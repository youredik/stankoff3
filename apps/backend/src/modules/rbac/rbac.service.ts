import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Role } from './role.entity';
import { User } from '../user/user.entity';
import { WorkspaceMember } from '../workspace/workspace-member.entity';
import { SectionMember } from '../section/section-member.entity';
import { Workspace } from '../workspace/workspace.entity';

interface CacheEntry {
  permissions: Map<string, Set<string>>;
  expiresAt: number;
}

/**
 * Сервис для проверки permissions.
 * Резолюция: globalRole ∪ sectionRole ∪ workspaceRole (additive).
 * Кэш in-memory с TTL 5 мин.
 */
@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = 5 * 60 * 1000; // 5 минут

  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(SectionMember)
    private readonly secMemberRepo: Repository<SectionMember>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
  ) {}

  // ── Permission matching ────────────────────────────────────

  /**
   * Проверяет, покрывает ли granted permission required permission.
   * Поддерживает wildcard (*) на любом уровне.
   */
  static matchPermission(required: string, granted: string): boolean {
    if (granted === '*') return true;

    const reqParts = required.split(':');
    const grantParts = granted.split(':');

    for (let i = 0; i < reqParts.length; i++) {
      if (i >= grantParts.length) return false;
      if (grantParts[i] === '*') return true;
      if (grantParts[i] !== reqParts[i]) {
        // Проверяем dot-level wildcard: 'entity.field.*' → 'entity.field.abc'
        if (grantParts[i].includes('*')) {
          if (RbacService.matchDotSegment(reqParts[i], grantParts[i])) {
            continue;
          }
        }
        return false;
      }
    }

    return reqParts.length === grantParts.length;
  }

  /**
   * Сопоставление dot-сегментов с wildcard:
   * 'entity.field.abc' matches 'entity.field.*'
   */
  private static matchDotSegment(required: string, granted: string): boolean {
    const reqDots = required.split('.');
    const grantDots = granted.split('.');

    for (let j = 0; j < reqDots.length; j++) {
      if (j >= grantDots.length) return false;
      if (grantDots[j] === '*') return true;
      if (grantDots[j] !== reqDots[j]) return false;
    }
    return reqDots.length === grantDots.length;
  }

  /**
   * Проверяет, есть ли required permission в наборе granted permissions.
   */
  static hasPermissionInSet(required: string, grantedSet: Set<string>): boolean {
    for (const granted of grantedSet) {
      if (RbacService.matchPermission(required, granted)) {
        return true;
      }
    }
    return false;
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Проверяет, есть ли у пользователя permission в контексте.
   */
  async hasPermission(
    userId: string,
    permission: string,
    context: { workspaceId?: string; sectionId?: string } = {},
  ): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(userId, context);
    return RbacService.hasPermissionInSet(permission, permissions);
  }

  /**
   * Вычисляет effective permissions для пользователя в контексте.
   * Результат кэшируется.
   */
  async getEffectivePermissions(
    userId: string,
    context: { workspaceId?: string; sectionId?: string } = {},
  ): Promise<Set<string>> {
    const contextKey = this.buildContextKey(context);
    const cached = this.getFromCache(userId, contextKey);
    if (cached) return cached;

    const permissions = new Set<string>();

    // 1. Global role permissions
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['globalRole'],
    });
    if (user?.globalRole) {
      for (const p of user.globalRole.permissions) {
        permissions.add(p);
      }
    }

    // 2. Section role permissions
    if (context.sectionId) {
      const secMember = await this.secMemberRepo.findOne({
        where: { sectionId: context.sectionId, userId },
        relations: ['sectionRole'],
      });
      if (secMember?.sectionRole) {
        for (const p of secMember.sectionRole.permissions) {
          permissions.add(p);
        }
      }
    }

    // 3. Workspace role permissions (+ section from workspace)
    if (context.workspaceId) {
      const wsMember = await this.wsMemberRepo.findOne({
        where: { workspaceId: context.workspaceId, userId },
        relations: ['workspaceRole'],
      });
      if (wsMember?.workspaceRole) {
        for (const p of wsMember.workspaceRole.permissions) {
          permissions.add(p);
        }
      }

      // Также подгружаем section role через workspace.sectionId
      if (!context.sectionId) {
        const workspace = await this.workspaceRepo.findOne({
          where: { id: context.workspaceId },
          select: ['id', 'sectionId'],
        });
        if (workspace?.sectionId) {
          const secMember = await this.secMemberRepo.findOne({
            where: { sectionId: workspace.sectionId, userId },
            relations: ['sectionRole'],
          });
          if (secMember?.sectionRole) {
            for (const p of secMember.sectionRole.permissions) {
              permissions.add(p);
            }
          }
        }
      }
    }

    this.setToCache(userId, contextKey, permissions);
    return permissions;
  }

  /**
   * Возвращает ID workspaces, к которым у пользователя есть доступ (любой workspace role).
   */
  async getAccessibleWorkspaceIds(userId: string): Promise<string[]> {
    // Проверяем: если у пользователя глобальная роль с '*' — возвращаем все
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['globalRole'],
    });
    if (user?.globalRole?.permissions.includes('*')) {
      const all = await this.workspaceRepo.find({
        where: { isInternal: false },
        select: ['id'],
      });
      return all.map((w) => w.id);
    }

    const memberships = await this.wsMemberRepo.find({
      where: { userId },
      select: ['workspaceId'],
    });
    return memberships.map((m) => m.workspaceId);
  }

  /**
   * Возвращает списки field ID, которые пользователь может читать/редактировать.
   * Если роль имеет wildcard (workspace:entity.field.*:read), возвращает null (= все поля).
   */
  async getFieldPermissions(
    userId: string,
    workspaceId: string,
  ): Promise<{ readable: string[] | null; writable: string[] | null }> {
    const permissions = await this.getEffectivePermissions(userId, { workspaceId });

    // Проверяем wildcard
    const canReadAll = RbacService.hasPermissionInSet('workspace:entity.field.*:read', permissions)
      || RbacService.hasPermissionInSet('workspace:entity:*', permissions)
      || RbacService.hasPermissionInSet('workspace:*', permissions)
      || permissions.has('*');

    const canWriteAll = RbacService.hasPermissionInSet('workspace:entity.field.*:update', permissions)
      || RbacService.hasPermissionInSet('workspace:entity.field.*:*', permissions)
      || RbacService.hasPermissionInSet('workspace:entity:*', permissions)
      || RbacService.hasPermissionInSet('workspace:*', permissions)
      || permissions.has('*');

    if (canReadAll && canWriteAll) {
      return { readable: null, writable: null }; // null = all fields
    }

    // Собираем конкретные field IDs из permissions
    const readable: string[] = [];
    const writable: string[] = [];

    for (const perm of permissions) {
      const fieldReadMatch = perm.match(/^workspace:entity\.field\.(.+):read$/);
      if (fieldReadMatch && fieldReadMatch[1] !== '*') {
        readable.push(fieldReadMatch[1]);
      }
      const fieldWriteMatch = perm.match(/^workspace:entity\.field\.(.+):update$/);
      if (fieldWriteMatch && fieldWriteMatch[1] !== '*') {
        writable.push(fieldWriteMatch[1]);
      }
    }

    return {
      readable: canReadAll ? null : readable,
      writable: canWriteAll ? null : writable,
    };
  }

  // ── Cache ──────────────────────────────────────────────────

  invalidateUser(userId: string): void {
    this.cache.delete(userId);
    this.logger.debug(`Cache invalidated for user ${userId}`);
  }

  invalidateAll(): void {
    this.cache.clear();
    this.logger.debug('Cache invalidated for all users');
  }

  // ── Private ────────────────────────────────────────────────

  private buildContextKey(context: { workspaceId?: string; sectionId?: string }): string {
    return `${context.workspaceId || '_'}:${context.sectionId || '_'}`;
  }

  private getFromCache(userId: string, contextKey: string): Set<string> | null {
    const entry = this.cache.get(userId);
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) this.cache.delete(userId);
      return null;
    }
    return entry.permissions.get(contextKey) || null;
  }

  private setToCache(userId: string, contextKey: string, permissions: Set<string>): void {
    let entry = this.cache.get(userId);
    if (!entry || entry.expiresAt < Date.now()) {
      entry = {
        permissions: new Map(),
        expiresAt: Date.now() + this.TTL,
      };
      this.cache.set(userId, entry);
    }
    entry.permissions.set(contextKey, permissions);
  }
}
