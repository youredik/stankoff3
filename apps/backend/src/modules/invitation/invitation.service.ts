import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Invitation, InvitationStatus, InvitationMembership } from './invitation.entity';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { BulkInviteDto } from './dto/bulk-invite.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { UserService } from '../user/user.service';
import { EmailService } from '../email/email.service';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';
import { SectionService } from '../section/section.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { RoleService } from '../rbac/role.service';
import { SectionRole } from '../section/section-member.entity';
import { WorkspaceRole } from '../workspace/workspace-member.entity';
import { User } from '../user/user.entity';

export interface CreateResult {
  invitation: Invitation;
  isExistingUser: boolean;
}

export interface BulkResult {
  total: number;
  created: number;
  existingUsers: number;
  failed: number;
  results: Array<{
    email: string;
    success: boolean;
    isExistingUser?: boolean;
    error?: string;
  }>;
}

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);
  private readonly expiryDays: number;
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(Invitation)
    private readonly invitationRepo: Repository<Invitation>,
    private readonly userService: UserService,
    private readonly emailService: EmailService,
    private readonly keycloakAdminService: KeycloakAdminService,
    private readonly sectionService: SectionService,
    private readonly workspaceService: WorkspaceService,
    private readonly roleService: RoleService,
    private readonly configService: ConfigService,
  ) {
    this.expiryDays = parseInt(this.configService.get('INVITATION_EXPIRY_DAYS', '7'), 10);
    this.frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
  }

  async create(dto: CreateInvitationDto, invitedBy: User): Promise<CreateResult> {
    const email = dto.email.toLowerCase().trim();

    // Проверяем, есть ли пользователь в БД
    const existingUser = await this.userService.findByEmail(email);

    if (existingUser) {
      return this.handleExistingUser(existingUser, dto, invitedBy);
    }

    return this.handleNewUser(email, dto, invitedBy);
  }

  async bulkCreate(dto: BulkInviteDto, invitedBy: User): Promise<BulkResult> {
    const results: BulkResult['results'] = [];
    let created = 0;
    let existingUsers = 0;
    let failed = 0;

    for (const inviteDto of dto.invitations) {
      try {
        const result = await this.create(inviteDto, invitedBy);
        results.push({
          email: inviteDto.email,
          success: true,
          isExistingUser: result.isExistingUser,
        });
        if (result.isExistingUser) {
          existingUsers++;
        } else {
          created++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ email: inviteDto.email, success: false, error: message });
        failed++;
      }
    }

    return { total: dto.invitations.length, created, existingUsers, failed, results };
  }

  async verifyToken(token: string): Promise<{
    valid: boolean;
    invitation?: { email: string; firstName: string | null; lastName: string | null };
  }> {
    const tokenHash = this.hashToken(token);
    const invitation = await this.invitationRepo.findOne({ where: { tokenHash } });

    if (!invitation) {
      return { valid: false };
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      return { valid: false };
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = InvitationStatus.EXPIRED;
      await this.invitationRepo.save(invitation);
      return { valid: false };
    }

    return {
      valid: true,
      invitation: {
        email: invitation.email,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
      },
    };
  }

  async accept(dto: AcceptInvitationDto): Promise<{ success: boolean; user: User }> {
    const tokenHash = this.hashToken(dto.token);
    const invitation = await this.invitationRepo.findOne({ where: { tokenHash } });

    if (!invitation) {
      throw new BadRequestException('Недействительная ссылка приглашения');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Приглашение уже использовано или отозвано');
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = InvitationStatus.EXPIRED;
      await this.invitationRepo.save(invitation);
      throw new BadRequestException('Срок действия приглашения истёк');
    }

    // Создаём пользователя в PostgreSQL
    const firstName = dto.firstName || invitation.firstName || '';
    const lastName = dto.lastName || invitation.lastName || '';

    const user = await this.userService.create({
      email: invitation.email,
      password: dto.password,
      firstName,
      lastName,
      department: invitation.department,
      isActive: true,
    });

    // Назначаем глобальную роль
    const globalRole = await this.roleService.findBySlug(invitation.globalRoleSlug);
    if (globalRole) {
      await this.userService.update(user.id, { roleId: globalRole.id } as any);
    }

    // Создаём пользователя в Keycloak (graceful degradation)
    await this.createKeycloakUser(user, dto.password);

    // Назначаем memberships
    await this.applyMemberships(user.id, invitation.memberships);

    // Обновляем приглашение
    invitation.status = InvitationStatus.ACCEPTED;
    invitation.acceptedById = user.id;
    invitation.acceptedAt = new Date();
    await this.invitationRepo.save(invitation);

    this.logger.log(`Приглашение принято: ${invitation.email} → User ${user.id}`);

    return { success: true, user };
  }

  async findAll(filters?: { status?: InvitationStatus; search?: string }): Promise<Invitation[]> {
    const query = this.invitationRepo.createQueryBuilder('invitation')
      .leftJoinAndSelect('invitation.invitedBy', 'invitedBy')
      .leftJoinAndSelect('invitation.acceptedBy', 'acceptedBy')
      .orderBy('invitation.createdAt', 'DESC');

    if (filters?.status) {
      query.andWhere('invitation.status = :status', { status: filters.status });
    }

    if (filters?.search) {
      query.andWhere(
        '(invitation.email ILIKE :search OR invitation.first_name ILIKE :search OR invitation.last_name ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    return query.getMany();
  }

  async revoke(id: string): Promise<Invitation> {
    const invitation = await this.invitationRepo.findOne({ where: { id } });
    if (!invitation) {
      throw new NotFoundException('Приглашение не найдено');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Можно отозвать только ожидающее приглашение');
    }

    invitation.status = InvitationStatus.REVOKED;
    return this.invitationRepo.save(invitation);
  }

  async resend(id: string, invitedBy: User): Promise<Invitation> {
    const invitation = await this.invitationRepo.findOne({ where: { id } });
    if (!invitation) {
      throw new NotFoundException('Приглашение не найдено');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Можно переотправить только ожидающее приглашение');
    }

    // Генерируем новый токен
    const token = this.generateToken();
    invitation.tokenHash = this.hashToken(token);
    invitation.expiresAt = this.getExpiryDate();
    const saved = await this.invitationRepo.save(invitation);

    // Отправляем email
    const acceptUrl = `${this.frontendUrl}/invite/accept?token=${token}`;
    await this.emailService.sendInvitationEmail(
      invitation.email,
      invitedBy,
      acceptUrl,
      this.expiryDays,
      invitation.firstName,
    );

    this.logger.log(`Приглашение переотправлено: ${invitation.email}`);
    return saved;
  }

  // === Private methods ===

  private async handleExistingUser(
    existingUser: User,
    dto: CreateInvitationDto,
    invitedBy: User,
  ): Promise<CreateResult> {
    const memberships: InvitationMembership[] = dto.memberships || [];

    // Назначаем memberships сразу
    await this.applyMemberships(existingUser.id, memberships);

    // Сохраняем запись для аудита
    const token = this.generateToken();
    const invitation = this.invitationRepo.create({
      email: existingUser.email,
      tokenHash: this.hashToken(token),
      status: InvitationStatus.ACCEPTED,
      firstName: existingUser.firstName,
      lastName: existingUser.lastName,
      department: existingUser.department,
      globalRoleSlug: dto.globalRoleSlug || 'employee',
      memberships,
      invitedById: invitedBy.id,
      acceptedById: existingUser.id,
      acceptedAt: new Date(),
      expiresAt: this.getExpiryDate(),
    });
    const saved = await this.invitationRepo.save(invitation);

    // Отправляем email-уведомление
    await this.emailService.sendAccessGrantedEmail(
      existingUser,
      invitedBy,
      this.frontendUrl,
    );

    this.logger.log(`Доступ назначен существующему пользователю: ${existingUser.email}`);
    return { invitation: saved, isExistingUser: true };
  }

  private async handleNewUser(
    email: string,
    dto: CreateInvitationDto,
    invitedBy: User,
  ): Promise<CreateResult> {
    // Отзываем предыдущие pending приглашения на этот email
    await this.revokePendingForEmail(email);

    const token = this.generateToken();
    const memberships: InvitationMembership[] = dto.memberships || [];

    const invitation = this.invitationRepo.create({
      email,
      tokenHash: this.hashToken(token),
      status: InvitationStatus.PENDING,
      firstName: dto.firstName || null,
      lastName: dto.lastName || null,
      department: dto.department || null,
      globalRoleSlug: dto.globalRoleSlug || 'employee',
      memberships,
      invitedById: invitedBy.id,
      expiresAt: this.getExpiryDate(),
    });
    const saved = await this.invitationRepo.save(invitation);

    // Отправляем email с приглашением
    const acceptUrl = `${this.frontendUrl}/invite/accept?token=${token}`;
    await this.emailService.sendInvitationEmail(
      email,
      invitedBy,
      acceptUrl,
      this.expiryDays,
      dto.firstName,
    );

    this.logger.log(`Приглашение отправлено: ${email}`);
    return { invitation: saved, isExistingUser: false };
  }

  private async revokePendingForEmail(email: string): Promise<void> {
    await this.invitationRepo.update(
      { email, status: InvitationStatus.PENDING },
      { status: InvitationStatus.REVOKED },
    );
  }

  private async applyMemberships(userId: string, memberships: InvitationMembership[]): Promise<void> {
    for (const m of memberships) {
      try {
        const role = await this.roleService.findBySlug(m.roleSlug);
        const roleId = role?.id;

        if (m.type === 'section') {
          const sectionRole = this.mapToSectionRole(m.roleSlug);
          await this.sectionService.addMember(m.targetId, userId, sectionRole, roleId);
        } else if (m.type === 'workspace') {
          const workspaceRole = this.mapToWorkspaceRole(m.roleSlug);
          await this.workspaceService.addMember(m.targetId, userId, workspaceRole, roleId);
        }
      } catch (error) {
        this.logger.warn(`Ошибка назначения membership ${m.type}:${m.targetId}: ${error}`);
      }
    }
  }

  private mapToSectionRole(slug: string): SectionRole {
    if (slug.includes('admin')) return SectionRole.ADMIN;
    return SectionRole.VIEWER;
  }

  private mapToWorkspaceRole(slug: string): WorkspaceRole {
    if (slug.includes('admin')) return WorkspaceRole.ADMIN;
    if (slug.includes('viewer')) return WorkspaceRole.VIEWER;
    return WorkspaceRole.EDITOR;
  }

  private async createKeycloakUser(user: User, password: string): Promise<void> {
    if (!this.keycloakAdminService.isConfigured()) {
      this.logger.warn('Keycloak не настроен, пропускаем создание учётки');
      return;
    }

    try {
      await this.keycloakAdminService.createUser({
        username: user.email,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        enabled: true,
        emailVerified: true,
      });

      const { userId } = await this.keycloakAdminService.userExistsByEmail(user.email);
      if (userId) {
        await this.keycloakAdminService.setUserPassword(userId, password, false);
      }
    } catch (error) {
      this.logger.error(`Ошибка создания пользователя в Keycloak: ${error}`);
    }
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private getExpiryDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() + this.expiryDays);
    return date;
  }
}
