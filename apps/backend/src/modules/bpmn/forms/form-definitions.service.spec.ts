import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { FormDefinitionsService } from './form-definitions.service';
import { FormDefinition } from '../entities/form-definition.entity';

describe('FormDefinitionsService', () => {
  let service: FormDefinitionsService;
  let repository: jest.Mocked<Repository<FormDefinition>>;

  const mockFormSchema = {
    type: 'default',
    components: [
      {
        type: 'textfield',
        key: 'name',
        label: 'Имя',
        validate: { required: true },
      },
      {
        type: 'textarea',
        key: 'comment',
        label: 'Комментарий',
      },
    ],
  };

  const mockForm = {
    id: 'form-1',
    workspaceId: 'ws-1',
    key: 'test-form',
    name: 'Тестовая форма',
    description: 'Описание',
    schema: mockFormSchema,
    uiSchema: null,
    version: 1,
    isActive: true,
    createdById: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    workspace: null as any,
    createdBy: null as any,
  } as unknown as FormDefinition;

  beforeEach(async () => {
    const mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormDefinitionsService,
        { provide: getRepositoryToken(FormDefinition), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<FormDefinitionsService>(FormDefinitionsService);
    repository = module.get(getRepositoryToken(FormDefinition));
  });

  describe('create', () => {
    it('должен создать новое определение формы', async () => {
      const dto = {
        workspaceId: 'ws-1',
        key: 'new-form',
        name: 'Новая форма',
        schema: mockFormSchema,
      };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue({ ...mockForm, ...dto } as unknown as FormDefinition);
      repository.save.mockResolvedValue({ ...mockForm, ...dto } as unknown as FormDefinition);

      const result = await service.create(dto, 'user-1');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', key: 'new-form' },
      });
      expect(repository.create).toHaveBeenCalledWith({
        ...dto,
        createdById: 'user-1',
        version: 1,
      });
      expect(result.name).toBe('Новая форма');
    });

    it('должен выбросить ConflictException при дублировании key', async () => {
      const dto = {
        workspaceId: 'ws-1',
        key: 'test-form',
        name: 'Дубль',
        schema: mockFormSchema,
      };

      repository.findOne.mockResolvedValue(mockForm);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('должен вернуть формы для workspace', async () => {
      repository.find.mockResolvedValue([mockForm]);

      const result = await service.findAll('ws-1');

      expect(repository.find).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        order: { name: 'ASC' },
      });
      expect(result).toHaveLength(1);
    });

    it('должен вернуть пустой массив если форм нет', async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.findAll('ws-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('должен вернуть форму по id', async () => {
      repository.findOne.mockResolvedValue(mockForm);

      const result = await service.findOne('form-1');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'form-1' },
        relations: ['createdBy'],
      });
      expect(result).toEqual(mockForm);
    });

    it('должен выбросить NotFoundException если форма не найдена', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne('form-999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByKey', () => {
    it('должен найти workspace-специфичную форму', async () => {
      repository.findOne.mockResolvedValue(mockForm);

      const result = await service.findByKey('test-form', 'ws-1');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { key: 'test-form', workspaceId: 'ws-1' },
      });
      expect(result).toEqual(mockForm);
    });

    it('должен упасть на глобальную форму если workspace-специфичной нет', async () => {
      const globalForm = { ...mockForm, workspaceId: null };
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(globalForm),
      };

      repository.findOne.mockResolvedValue(null);
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      const result = await service.findByKey('test-form', 'ws-1');

      expect(result).toEqual(globalForm);
    });

    it('должен вернуть null если форма не найдена', async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };

      repository.findOne.mockResolvedValue(null);
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      const result = await service.findByKey('unknown-form', 'ws-1');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('должен обновить форму', async () => {
      const formCopy = { ...mockForm };
      repository.findOne.mockResolvedValue(formCopy);
      repository.save.mockResolvedValue({ ...formCopy, name: 'Обновлённая' });

      const result = await service.update('form-1', { name: 'Обновлённая' });

      expect(result.name).toBe('Обновлённая');
    });

    it('должен инкрементировать version при изменении schema', async () => {
      const formCopy = { ...mockForm, version: 1 };
      repository.findOne.mockResolvedValue(formCopy);
      repository.save.mockImplementation((f) => Promise.resolve(f as FormDefinition));

      await service.update('form-1', { schema: { type: 'default', components: [] } });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ version: 2 }),
      );
    });

    it('должен выбросить ConflictException при дублировании key', async () => {
      const formCopy = { ...mockForm };
      // findOne для findOne(id) — первый вызов
      repository.findOne
        .mockResolvedValueOnce(formCopy) // findOne в update
        .mockResolvedValueOnce({ ...mockForm, id: 'form-2' } as unknown as FormDefinition); // проверка уникальности

      await expect(
        service.update('form-1', { key: 'existing-key' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('должен удалить форму', async () => {
      repository.findOne.mockResolvedValue(mockForm);

      await service.delete('form-1');

      expect(repository.remove).toHaveBeenCalledWith(mockForm);
    });

    it('должен выбросить NotFoundException если форма не найдена', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.delete('form-999')).rejects.toThrow(NotFoundException);
    });
  });
});
