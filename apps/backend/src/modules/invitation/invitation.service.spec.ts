import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { InvitationService } from './invitation.service';
import { Invitation, InvitationStatus } from './invitation.entity';
import { UserService } from '../user/user.service';
import { EmailService } from '../email/email.service';
import { KeycloakAdminService } from '../auth/keycloak-admin.service';
import { SectionService } from '../section/section.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { RoleService } from '../rbac/role.service';
import { User } from '../user/user.entity';

describe('InvitationService', () => {
  let service: InvitationService;
  let invitationRepo: jest.Mocked<Repository<Invitation>>;
  let userService: jest.Mocked<UserService>;
  let emailService: jest.Mocked<EmailService>;
  let keycloakAdminService: jest.Mocked<KeycloakAdminService>;
  let sectionService: jest.Mocked<SectionService>;
  let workspaceService: jest.Mocked<WorkspaceService>;
  let roleService: jest.Mocked<RoleService>;

  const mockUser: Partial<User> = {
    id: 'user-1',
    email: 'admin@stankoff.ru',
    firstName: 'Админ',
    lastName: 'Тестовый',
    department: 'IT',
    isActive: true,
  };

  const mockInvitedUser: Partial<User> = {
    id: 'user-2',
    email: 'existing@stankoff.ru',
    firstName: 'Иван',
    lastName: 'Иванов',
    department: null,
    isActive: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationService,
        {
          provide: getRepositoryToken(Invitation),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendInvitationEmail: jest.fn().mockResolvedValue(true),
            sendAccessGrantedEmail: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: KeycloakAdminService,
          useValue: {
            isConfigured: jest.fn().mockReturnValue(false),
            createUser: jest.fn(),
            userExistsByEmail: jest.fn(),
            setUserPassword: jest.fn(),
          },
        },
        {
          provide: SectionService,
          useValue: { addMember: jest.fn() },
        },
        {
          provide: WorkspaceService,
          useValue: { addMember: jest.fn() },
        },
        {
          provide: RoleService,
          useValue: { findBySlug: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const map: Record<string, string> = {
                INVITATION_EXPIRY_DAYS: '7',
                FRONTEND_URL: 'http://localhost:3000',
              };
              return map[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<InvitationService>(InvitationService);
    invitationRepo = module.get(getRepositoryToken(Invitation));
    userService = module.get(UserService) as jest.Mocked<UserService>;
    emailService = module.get(EmailService) as jest.Mocked<EmailService>;
    keycloakAdminService = module.get(KeycloakAdminService) as jest.Mocked<KeycloakAdminService>;
    sectionService = module.get(SectionService) as jest.Mocked<SectionService>;
    workspaceService = module.get(WorkspaceService) as jest.Mocked<WorkspaceService>;
    roleService = module.get(RoleService) as jest.Mocked<RoleService>;
  });

  describe('create', () => {
    it('должен создать приглашение для нового пользователя', async () => {
      userService.findByEmail.mockResolvedValue(null);
      invitationRepo.update.mockResolvedValue({ affected: 0 } as any);
      invitationRepo.create.mockImplementation((data) => ({ ...data, id: 'inv-1' } as any));
      invitationRepo.save.mockImplementation((inv) => Promise.resolve(inv as Invitation));

      const result = await service.create(
        { email: 'new@stankoff.ru', firstName: 'Пётр', lastName: 'Петров' },
        mockUser as User,
      );

      expect(result.isExistingUser).toBe(false);
      expect(result.invitation.email).toBe('new@stankoff.ru');
      expect(result.invitation.status).toBe(InvitationStatus.PENDING);
      expect(emailService.sendInvitationEmail).toHaveBeenCalledWith(
        'new@stankoff.ru',
        mockUser,
        expect.stringContaining('http://localhost:3000/invite/accept?token='),
        7,
        'Пётр',
      );
    });

    it('должен назначить доступ существующему пользователю без токена', async () => {
      userService.findByEmail.mockResolvedValue(mockInvitedUser as User);
      invitationRepo.create.mockImplementation((data) => ({ ...data, id: 'inv-2' } as any));
      invitationRepo.save.mockImplementation((inv) => Promise.resolve(inv as Invitation));
      roleService.findBySlug.mockResolvedValue({ id: 'role-ws-editor' } as any);

      const result = await service.create(
        {
          email: 'existing@stankoff.ru',
          memberships: [
            { type: 'workspace', targetId: 'ws-1', roleSlug: 'ws_editor' },
          ],
        },
        mockUser as User,
      );

      expect(result.isExistingUser).toBe(true);
      expect(result.invitation.status).toBe(InvitationStatus.ACCEPTED);
      expect(workspaceService.addMember).toHaveBeenCalledWith('ws-1', 'user-2', 'editor', 'role-ws-editor');
      expect(emailService.sendAccessGrantedEmail).toHaveBeenCalledWith(
        mockInvitedUser,
        mockUser,
        'http://localhost:3000',
      );
    });

    it('должен отозвать предыдущее pending приглашение на тот же email', async () => {
      userService.findByEmail.mockResolvedValue(null);
      invitationRepo.update.mockResolvedValue({ affected: 1 } as any);
      invitationRepo.create.mockImplementation((data) => ({ ...data, id: 'inv-3' } as any));
      invitationRepo.save.mockImplementation((inv) => Promise.resolve(inv as Invitation));

      await service.create({ email: 'new@stankoff.ru' }, mockUser as User);

      expect(invitationRepo.update).toHaveBeenCalledWith(
        { email: 'new@stankoff.ru', status: InvitationStatus.PENDING },
        { status: InvitationStatus.REVOKED },
      );
    });
  });

  describe('bulkCreate', () => {
    it('должен обработать массовое приглашение', async () => {
      userService.findByEmail
        .mockResolvedValueOnce(null) // первый — новый
        .mockResolvedValueOnce(mockInvitedUser as User); // второй — существующий

      invitationRepo.update.mockResolvedValue({ affected: 0 } as any);
      invitationRepo.create.mockImplementation((data) => ({ ...data, id: 'inv-bulk' } as any));
      invitationRepo.save.mockImplementation((inv) => Promise.resolve(inv as Invitation));

      const result = await service.bulkCreate(
        {
          invitations: [
            { email: 'new@stankoff.ru' },
            { email: 'existing@stankoff.ru' },
          ],
        },
        mockUser as User,
      );

      expect(result.total).toBe(2);
      expect(result.created).toBe(1);
      expect(result.existingUsers).toBe(1);
      expect(result.failed).toBe(0);
    });
  });

  describe('verifyToken', () => {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    it('должен вернуть valid=true для действительного токена', async () => {
      invitationRepo.findOne.mockResolvedValue({
        tokenHash,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
        email: 'test@stankoff.ru',
        firstName: 'Тест',
        lastName: 'Тестов',
      } as Invitation);

      const result = await service.verifyToken(token);

      expect(result.valid).toBe(true);
      expect(result.invitation?.email).toBe('test@stankoff.ru');
    });

    it('должен вернуть valid=false для несуществующего токена', async () => {
      invitationRepo.findOne.mockResolvedValue(null);

      const result = await service.verifyToken('nonexistent');

      expect(result.valid).toBe(false);
    });

    it('должен пометить expired и вернуть valid=false для просроченного', async () => {
      const expiredInvitation = {
        tokenHash,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() - 86400000), // вчера
        email: 'expired@stankoff.ru',
      } as Invitation;
      invitationRepo.findOne.mockResolvedValue(expiredInvitation);
      invitationRepo.save.mockResolvedValue(expiredInvitation);

      const result = await service.verifyToken(token);

      expect(result.valid).toBe(false);
      expect(invitationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: InvitationStatus.EXPIRED }),
      );
    });

    it('должен вернуть valid=false для revoked приглашения', async () => {
      invitationRepo.findOne.mockResolvedValue({
        tokenHash,
        status: InvitationStatus.REVOKED,
        expiresAt: new Date(Date.now() + 86400000),
      } as Invitation);

      const result = await service.verifyToken(token);

      expect(result.valid).toBe(false);
    });
  });

  describe('accept', () => {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    it('должен создать пользователя и принять приглашение', async () => {
      const invitation = {
        id: 'inv-1',
        tokenHash,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
        email: 'new@stankoff.ru',
        firstName: 'Новый',
        lastName: 'Пользователь',
        department: 'Продажи',
        globalRoleSlug: 'employee',
        memberships: [
          { type: 'workspace' as const, targetId: 'ws-1', roleSlug: 'ws_editor' },
          { type: 'section' as const, targetId: 'sec-1', roleSlug: 'section_viewer' },
        ],
      } as Invitation;

      invitationRepo.findOne.mockResolvedValue(invitation);
      const createdUser = { id: 'new-user', email: 'new@stankoff.ru', firstName: 'Новый', lastName: 'Пользователь' } as User;
      userService.create.mockResolvedValue(createdUser);
      userService.update.mockResolvedValue(createdUser);
      roleService.findBySlug.mockResolvedValue({ id: 'role-1' } as any);
      invitationRepo.save.mockImplementation((inv) => Promise.resolve(inv as Invitation));

      const result = await service.accept({
        token,
        password: 'secure123',
      });

      expect(result.success).toBe(true);
      expect(result.user.id).toBe('new-user');
      expect(userService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@stankoff.ru',
          password: 'secure123',
          firstName: 'Новый',
          lastName: 'Пользователь',
        }),
      );
      expect(workspaceService.addMember).toHaveBeenCalled();
      expect(sectionService.addMember).toHaveBeenCalled();
    });

    it('должен выбросить ошибку для недействительного токена', async () => {
      invitationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.accept({ token: 'bad-token', password: 'test123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен выбросить ошибку для просроченного приглашения', async () => {
      invitationRepo.findOne.mockResolvedValue({
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() - 86400000),
      } as Invitation);
      invitationRepo.save.mockImplementation((inv) => Promise.resolve(inv as Invitation));

      await expect(
        service.accept({ token, password: 'test123' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('revoke', () => {
    it('должен отозвать pending приглашение', async () => {
      const invitation = { id: 'inv-1', status: InvitationStatus.PENDING } as Invitation;
      invitationRepo.findOne.mockResolvedValue(invitation);
      invitationRepo.save.mockImplementation((inv) => Promise.resolve(inv as Invitation));

      const result = await service.revoke('inv-1');

      expect(result.status).toBe(InvitationStatus.REVOKED);
    });

    it('должен выбросить ошибку для уже принятого приглашения', async () => {
      invitationRepo.findOne.mockResolvedValue({
        id: 'inv-1',
        status: InvitationStatus.ACCEPTED,
      } as Invitation);

      await expect(service.revoke('inv-1')).rejects.toThrow(BadRequestException);
    });

    it('должен выбросить NotFoundException для несуществующего', async () => {
      invitationRepo.findOne.mockResolvedValue(null);

      await expect(service.revoke('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resend', () => {
    it('должен переотправить с новым токеном', async () => {
      const invitation = {
        id: 'inv-1',
        email: 'test@stankoff.ru',
        status: InvitationStatus.PENDING,
        firstName: 'Тест',
      } as Invitation;
      invitationRepo.findOne.mockResolvedValue(invitation);
      invitationRepo.save.mockImplementation((inv) => Promise.resolve(inv as Invitation));

      await service.resend('inv-1', mockUser as User);

      expect(invitationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: expect.any(String) }),
      );
      expect(emailService.sendInvitationEmail).toHaveBeenCalled();
    });

    it('должен выбросить ошибку для не-pending приглашения', async () => {
      invitationRepo.findOne.mockResolvedValue({
        id: 'inv-1',
        status: InvitationStatus.ACCEPTED,
      } as Invitation);

      await expect(
        service.resend('inv-1', mockUser as User),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
