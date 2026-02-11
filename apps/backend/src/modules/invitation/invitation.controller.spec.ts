import { Test, TestingModule } from '@nestjs/testing';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { InvitationStatus } from './invitation.entity';
import { User } from '../user/user.entity';

describe('InvitationController', () => {
  let controller: InvitationController;
  let service: jest.Mocked<InvitationService>;

  const mockUser = { id: 'user-1', email: 'admin@stankoff.ru' } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitationController],
      providers: [
        {
          provide: InvitationService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue({ invitation: {}, isExistingUser: false }),
            bulkCreate: jest.fn().mockResolvedValue({ total: 0, created: 0, existingUsers: 0, failed: 0, results: [] }),
            revoke: jest.fn().mockResolvedValue({ status: InvitationStatus.REVOKED }),
            resend: jest.fn().mockResolvedValue({}),
            verifyToken: jest.fn().mockResolvedValue({ valid: true }),
            accept: jest.fn().mockResolvedValue({ success: true }),
          },
        },
      ],
    }).compile();

    controller = module.get<InvitationController>(InvitationController);
    service = module.get(InvitationService) as jest.Mocked<InvitationService>;
  });

  it('должен быть определён', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('должен вызвать service.findAll с фильтрами', async () => {
      await controller.findAll(InvitationStatus.PENDING, 'test');
      expect(service.findAll).toHaveBeenCalledWith({
        status: InvitationStatus.PENDING,
        search: 'test',
      });
    });
  });

  describe('create', () => {
    it('должен вызвать service.create', async () => {
      const dto = { email: 'new@stankoff.ru' };
      await controller.create(dto, mockUser);
      expect(service.create).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  describe('bulkCreate', () => {
    it('должен вызвать service.bulkCreate', async () => {
      const dto = { invitations: [{ email: 'a@b.ru' }] };
      await controller.bulkCreate(dto, mockUser);
      expect(service.bulkCreate).toHaveBeenCalledWith(dto, mockUser);
    });
  });

  describe('revoke', () => {
    it('должен вызвать service.revoke', async () => {
      await controller.revoke('inv-1');
      expect(service.revoke).toHaveBeenCalledWith('inv-1');
    });
  });

  describe('resend', () => {
    it('должен вызвать service.resend', async () => {
      await controller.resend('inv-1', mockUser);
      expect(service.resend).toHaveBeenCalledWith('inv-1', mockUser);
    });
  });

  describe('verifyToken', () => {
    it('должен вызвать service.verifyToken', async () => {
      await controller.verifyToken('some-token');
      expect(service.verifyToken).toHaveBeenCalledWith('some-token');
    });
  });

  describe('accept', () => {
    it('должен вызвать service.accept', async () => {
      const dto = { token: 'abc', password: 'test123' };
      await controller.accept(dto);
      expect(service.accept).toHaveBeenCalledWith(dto);
    });
  });
});
