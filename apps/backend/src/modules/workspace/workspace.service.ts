import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from './workspace.entity';
import { WorkspaceMember, WorkspaceRole } from './workspace-member.entity';
import { UserRole } from '../user/user.entity';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private memberRepository: Repository<WorkspaceMember>,
  ) {}

  // Получить все workspaces (фильтрация по пользователю)
  async findAll(userId: string, userRole: UserRole): Promise<Workspace[]> {
    // Глобальный admin видит все
    if (userRole === UserRole.ADMIN) {
      return this.workspaceRepository.find();
    }

    // Остальные видят только свои
    const memberships = await this.memberRepository.find({
      where: { userId },
      relations: ['workspace'],
    });

    return memberships.map((m) => m.workspace);
  }

  async findOne(id: string): Promise<Workspace | null> {
    return this.workspaceRepository.findOne({ where: { id } });
  }

  // Проверка доступа пользователя к workspace
  async checkAccess(
    workspaceId: string,
    userId: string,
    userRole: UserRole,
    requiredRole?: WorkspaceRole,
  ): Promise<WorkspaceMember | null> {
    // Глобальный admin имеет полный доступ
    if (userRole === UserRole.ADMIN) {
      return { role: WorkspaceRole.ADMIN } as WorkspaceMember;
    }

    const membership = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });

    if (!membership) {
      return null;
    }

    // Проверка минимальной роли
    if (requiredRole) {
      const roleHierarchy = {
        [WorkspaceRole.VIEWER]: 0,
        [WorkspaceRole.EDITOR]: 1,
        [WorkspaceRole.ADMIN]: 2,
      };
      if (roleHierarchy[membership.role] < roleHierarchy[requiredRole]) {
        return null;
      }
    }

    return membership;
  }

  async create(workspaceData: Partial<Workspace>, creatorId: string): Promise<Workspace> {
    const workspace = this.workspaceRepository.create(workspaceData);
    const saved = await this.workspaceRepository.save(workspace);

    // Добавляем создателя как admin workspace
    await this.addMember(saved.id, creatorId, WorkspaceRole.ADMIN);

    return saved;
  }

  async update(id: string, workspaceData: Partial<Workspace>): Promise<Workspace | null> {
    await this.workspaceRepository.update(id, workspaceData);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.workspaceRepository.delete(id);
  }

  // === Управление участниками ===

  async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.memberRepository.find({
      where: { workspaceId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole = WorkspaceRole.EDITOR,
  ): Promise<WorkspaceMember> {
    // Проверяем существование workspace
    const workspace = await this.findOne(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace не найден');
    }

    // Проверяем, не является ли уже членом
    const existing = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });
    if (existing) {
      // Обновляем роль
      existing.role = role;
      return this.memberRepository.save(existing);
    }

    const member = this.memberRepository.create({ workspaceId, userId, role });
    return this.memberRepository.save(member);
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
  ): Promise<WorkspaceMember> {
    const member = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });
    if (!member) {
      throw new NotFoundException('Участник не найден');
    }

    member.role = role;
    return this.memberRepository.save(member);
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const result = await this.memberRepository.delete({ workspaceId, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Участник не найден');
    }
  }
}
