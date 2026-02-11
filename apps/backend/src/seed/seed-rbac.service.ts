import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../modules/rbac/role.entity';
import { User } from '../modules/user/user.entity';
import { WorkspaceMember } from '../modules/workspace/workspace-member.entity';
import { SectionMember } from '../modules/section/section-member.entity';
import { SYSTEM_ROLES, LEGACY_ROLE_MAPPING } from '../modules/rbac/system-roles';

/**
 * Seed сервис для RBAC.
 * Две фазы:
 * 1. seedRolesAndGlobal() — создаёт системные роли + глобальные назначения (до создания structure)
 * 2. seedMembershipRoles() — назначает workspace/section роли (после создания structure)
 */
@Injectable()
export class SeedRbacService {
  private readonly logger = new Logger(SeedRbacService.name);
  private roleMap = new Map<string, Role>();

  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(SectionMember)
    private readonly secMemberRepo: Repository<SectionMember>,
  ) {}

  /**
   * Фаза 1: Upsert системных ролей + назначить глобальные роли пользователям.
   * Вызывается ПОСЛЕ создания пользователей, ПЕРЕД структурой.
   */
  async seedRolesAndGlobal(users: User[]): Promise<void> {
    // 1. Upsert системных ролей
    this.logger.log(`Создание ${SYSTEM_ROLES.length} системных ролей...`);
    for (const def of SYSTEM_ROLES) {
      let role = await this.roleRepo.findOne({ where: { slug: def.slug } });
      if (role) {
        role.name = def.name;
        role.description = def.description;
        role.permissions = def.permissions;
        role.isSystem = true;
        role.isDefault = def.isDefault;
        role = await this.roleRepo.save(role);
      } else {
        role = await this.roleRepo.save(
          this.roleRepo.create({
            id: def.id,
            slug: def.slug,
            name: def.name,
            description: def.description,
            scope: def.scope,
            permissions: def.permissions,
            isSystem: true,
            isDefault: def.isDefault,
          }),
        );
      }
      this.roleMap.set(def.slug, role);
    }

    // 2. Назначаем глобальные роли пользователям
    let globalAssigned = 0;
    for (const user of users) {
      if (user.roleId) continue;

      const legacyRole = user.role;
      const targetSlug = LEGACY_ROLE_MAPPING.global[legacyRole] || 'employee';
      const targetRole = this.roleMap.get(targetSlug);

      if (targetRole) {
        user.roleId = targetRole.id;
        await this.userRepo.save(user);
        globalAssigned++;
      }
    }

    this.logger.log(
      `RBAC фаза 1: ${SYSTEM_ROLES.length} ролей, ${globalAssigned} глобальных назначений`,
    );
  }

  /**
   * Фаза 2: Назначить workspace/section роли для membership записей.
   * Вызывается ПОСЛЕ создания structure (sections + workspaces + members).
   */
  async seedMembershipRoles(): Promise<void> {
    // Если roleMap пуст — подгружаем роли из БД
    if (this.roleMap.size === 0) {
      const roles = await this.roleRepo.find();
      for (const role of roles) {
        this.roleMap.set(role.slug, role);
      }
    }

    // Workspace роли
    const wsMembers = await this.wsMemberRepo.find();
    let wsAssigned = 0;
    for (const member of wsMembers) {
      if (member.roleId) continue;

      const legacyRole = member.role;
      const targetSlug = LEGACY_ROLE_MAPPING.workspace[legacyRole] || 'ws_editor';
      const targetRole = this.roleMap.get(targetSlug);

      if (targetRole) {
        member.roleId = targetRole.id;
        await this.wsMemberRepo.save(member);
        wsAssigned++;
      }
    }

    // Section роли
    const secMembers = await this.secMemberRepo.find();
    let secAssigned = 0;
    for (const member of secMembers) {
      if (member.roleId) continue;

      const legacyRole = member.role;
      const targetSlug = LEGACY_ROLE_MAPPING.section[legacyRole] || 'section_viewer';
      const targetRole = this.roleMap.get(targetSlug);

      if (targetRole) {
        member.roleId = targetRole.id;
        await this.secMemberRepo.save(member);
        secAssigned++;
      }
    }

    this.logger.log(
      `RBAC фаза 2: ${wsAssigned} workspace, ${secAssigned} section назначений`,
    );
  }
}
