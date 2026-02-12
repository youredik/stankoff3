import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserGroup } from '../modules/bpmn/entities/user-group.entity';
import { User } from '../modules/user/user.entity';
import { Workspace } from '../modules/workspace/workspace.entity';
import { WorkspaceMember } from '../modules/workspace/workspace-member.entity';
import { SeedWorkspaces } from './seed-structure.service';

/**
 * Seed user groups for BPMN candidateGroups.
 * Creates groups per workspace and assigns members based on department/role.
 */

interface GroupDef {
  key: string;
  name: string;
  description: string;
  /** Department keys whose members are added to this group */
  departments: string[];
  /** If true, only managers/admins from those departments */
  managersOnly?: boolean;
}

const GROUP_DEFINITIONS: GroupDef[] = [
  {
    key: 'claims-specialists',
    name: 'Специалисты по рекламациям',
    description: 'Обработка рекламаций и претензий',
    departments: ['service', 'sales'],
  },
  {
    key: 'l1-supervisors',
    name: 'Супервайзеры L1',
    description: 'Первая линия поддержки — надзор',
    departments: ['service'],
    managersOnly: true,
  },
  {
    key: 'l2-support',
    name: 'Поддержка L2',
    description: 'Вторая линия технической поддержки',
    departments: ['service', 'it'],
  },
  {
    key: 'managers',
    name: 'Менеджеры',
    description: 'Все менеджеры и руководители',
    departments: ['sales', 'service', 'accounting', 'marketing', 'logistics', 'hr', 'fea', 'it', 'admin'],
    managersOnly: true,
  },
  {
    key: 'support-agents',
    name: 'Агенты поддержки',
    description: 'Сотрудники поддержки клиентов',
    departments: ['service', 'sales'],
  },
  {
    key: 'accountants',
    name: 'Бухгалтеры',
    description: 'Финансовый отдел',
    departments: ['accounting'],
  },
  {
    key: 'approvers',
    name: 'Согласующие',
    description: 'Руководители, согласующие документы',
    departments: ['sales', 'service', 'accounting', 'marketing', 'logistics', 'hr', 'fea', 'it', 'admin'],
    managersOnly: true,
  },
];

@Injectable()
export class SeedUserGroupsService {
  private readonly logger = new Logger(SeedUserGroupsService.name);

  constructor(
    @InjectRepository(UserGroup)
    private readonly groupRepo: Repository<UserGroup>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
  ) {}

  async createAll(
    workspaces: SeedWorkspaces,
    itWs: Workspace,
    users: User[],
  ): Promise<void> {
    const allWorkspaces = [...Object.values(workspaces), itWs].filter(Boolean);
    let groupCount = 0;
    let memberCount = 0;

    // Build department → users map
    const deptUsers = new Map<string, User[]>();
    for (const user of users) {
      const dept = (user as any).departmentKey || user.department || 'other';
      if (!deptUsers.has(dept)) deptUsers.set(dept, []);
      deptUsers.get(dept)!.push(user);
    }

    for (const ws of allWorkspaces) {
      // Get workspace members
      const wsMembers = await this.memberRepo.find({
        where: { workspaceId: ws.id },
        relations: ['user'],
      });
      const wsMemberIds = new Set(wsMembers.map((m) => m.userId));

      for (const def of GROUP_DEFINITIONS) {
        // Collect eligible users
        const eligible: User[] = [];
        for (const dept of def.departments) {
          const deptList = deptUsers.get(dept) || [];
          for (const u of deptList) {
            if (!wsMemberIds.has(u.id)) continue; // Must be workspace member
            if (def.managersOnly && u.role !== 'admin' && u.role !== 'manager') continue;
            eligible.push(u);
          }
        }

        if (eligible.length === 0) continue;

        // Create group
        let group = await this.groupRepo.findOne({
          where: { workspaceId: ws.id, key: def.key },
        });

        if (!group) {
          group = this.groupRepo.create({
            workspaceId: ws.id,
            name: def.name,
            key: def.key,
            description: def.description,
          });
          group = await this.groupRepo.save(group);
          groupCount++;
        }

        // Add members via junction table
        group.members = eligible;
        await this.groupRepo.save(group);
        memberCount += eligible.length;
      }
    }

    // Also add super_admin (youredik@gmail.com) to ALL groups in ALL workspaces
    const superAdmin = users.find((u) => u.email === 'youredik@gmail.com');
    if (superAdmin) {
      const allGroups = await this.groupRepo.find({ relations: ['members'] });
      for (const group of allGroups) {
        if (!group.members.some((m) => m.id === superAdmin.id)) {
          group.members.push(superAdmin);
          await this.groupRepo.save(group);
          memberCount++;
        }
      }
    }

    this.logger.log(
      `Создано ${groupCount} групп, ${memberCount} назначений`,
    );
  }
}
