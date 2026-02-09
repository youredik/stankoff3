import { Test, TestingModule } from '@nestjs/testing';
import { FormDefinitionsController } from './form-definitions.controller';
import { FormDefinitionsService } from './form-definitions.service';
import { FormDefinition } from '../entities/form-definition.entity';

describe('FormDefinitionsController', () => {
  let controller: FormDefinitionsController;
  let service: jest.Mocked<FormDefinitionsService>;

  const mockForm = {
    id: 'form-1',
    workspaceId: 'ws-1',
    key: 'test-form',
    name: 'Тестовая форма',
    description: 'Описание',
    schema: { type: 'default', components: [] },
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
    const mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      findByKey: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FormDefinitionsController],
      providers: [
        { provide: FormDefinitionsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<FormDefinitionsController>(FormDefinitionsController);
    service = module.get(FormDefinitionsService);
  });

  describe('getFormDefinitions', () => {
    it('должен вернуть список форм для workspace', async () => {
      service.findAll.mockResolvedValue([mockForm]);

      const result = await controller.getFormDefinitions('ws-1');

      expect(service.findAll).toHaveBeenCalledWith('ws-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getFormDefinition', () => {
    it('должен вернуть одну форму по id', async () => {
      service.findOne.mockResolvedValue(mockForm);

      const result = await controller.getFormDefinition('form-1');

      expect(service.findOne).toHaveBeenCalledWith('form-1');
      expect(result.key).toBe('test-form');
    });
  });

  describe('createFormDefinition', () => {
    it('должен создать форму', async () => {
      const dto = {
        workspaceId: 'ws-1',
        key: 'new-form',
        name: 'Новая',
        schema: { type: 'default', components: [] },
      };
      service.create.mockResolvedValue({ ...mockForm, ...dto } as unknown as FormDefinition);

      const result = await controller.createFormDefinition(dto, { user: { id: 'user-1' } });

      expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
      expect(result.key).toBe('new-form');
    });
  });

  describe('updateFormDefinition', () => {
    it('должен обновить форму', async () => {
      const dto = { name: 'Обновлённая' };
      service.update.mockResolvedValue({ ...mockForm, name: 'Обновлённая' });

      const result = await controller.updateFormDefinition('form-1', dto);

      expect(service.update).toHaveBeenCalledWith('form-1', dto);
      expect(result.name).toBe('Обновлённая');
    });
  });

  describe('deleteFormDefinition', () => {
    it('должен удалить форму', async () => {
      service.delete.mockResolvedValue(undefined);

      await controller.deleteFormDefinition('form-1');

      expect(service.delete).toHaveBeenCalledWith('form-1');
    });
  });
});
