import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityLinksService } from './entity-links.service';
import { EntityLink, EntityLinkType } from '../entities/entity-link.entity';
import { EntityService } from '../../entity/entity.service';

describe('EntityLinksService', () => {
  let service: EntityLinksService;
  let linkRepository: jest.Mocked<Repository<EntityLink>>;
  let entityService: jest.Mocked<EntityService>;

  const mockEntity = {
    id: 'entity-1',
    customId: 'WS-001',
    title: 'Test Entity',
    status: 'new',
    workspaceId: 'ws-1',
    priority: 'medium',
    data: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockLink: EntityLink = {
    id: 'link-1',
    sourceEntityId: 'entity-1',
    sourceEntity: mockEntity as any,
    targetEntityId: 'entity-2',
    targetEntity: { ...mockEntity, id: 'entity-2', customId: 'WS-002' } as any,
    linkType: EntityLinkType.SPAWNED,
    metadata: {},
    createdById: 'user-1',
    createdBy: null as any,
    processInstanceId: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityLinksService,
        {
          provide: getRepositoryToken(EntityLink),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            delete: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: EntityService,
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EntityLinksService>(EntityLinksService);
    linkRepository = module.get(getRepositoryToken(EntityLink));
    entityService = module.get(EntityService);
  });

  describe('createLink', () => {
    it('должен создавать связь между сущностями', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      linkRepository.findOne.mockResolvedValue(null);
      linkRepository.create.mockReturnValue(mockLink);
      linkRepository.save.mockResolvedValue(mockLink);

      const result = await service.createLink({
        sourceEntityId: 'entity-1',
        targetEntityId: 'entity-2',
        linkType: EntityLinkType.SPAWNED,
      });

      expect(result).toEqual(mockLink);
      expect(entityService.findOne).toHaveBeenCalledTimes(2);
    });

    it('должен возвращать существующую связь если дубликат', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      linkRepository.findOne.mockResolvedValue(mockLink);

      const result = await service.createLink({
        sourceEntityId: 'entity-1',
        targetEntityId: 'entity-2',
        linkType: EntityLinkType.SPAWNED,
      });

      expect(result).toEqual(mockLink);
      expect(linkRepository.save).not.toHaveBeenCalled();
    });

    it('должен выбрасывать BadRequestException при самоссылке', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      linkRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createLink({
          sourceEntityId: 'entity-1',
          targetEntityId: 'entity-1',
          linkType: EntityLinkType.RELATED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен создавать обратную связь для BLOCKS', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      linkRepository.findOne.mockResolvedValue(null);
      linkRepository.create.mockReturnValue(mockLink);
      linkRepository.save.mockResolvedValue(mockLink);

      await service.createLink({
        sourceEntityId: 'entity-1',
        targetEntityId: 'entity-2',
        linkType: EntityLinkType.BLOCKS,
      });

      // Проверяем что save был вызван дважды (прямая и обратная связь)
      expect(linkRepository.save).toHaveBeenCalledTimes(2);
    });

    it('должен создавать обратную связь для PARENT/CHILD', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      linkRepository.findOne.mockResolvedValue(null);
      linkRepository.create.mockReturnValue(mockLink);
      linkRepository.save.mockResolvedValue(mockLink);

      await service.createLink({
        sourceEntityId: 'entity-1',
        targetEntityId: 'entity-2',
        linkType: EntityLinkType.PARENT,
      });

      expect(linkRepository.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('getLinksForEntity', () => {
    it('должен возвращать все связи сущности', async () => {
      linkRepository.find.mockResolvedValue([mockLink]);

      const result = await service.getLinksForEntity('entity-1');

      expect(result).toEqual([mockLink]);
      expect(linkRepository.find).toHaveBeenCalledWith({
        where: [{ sourceEntityId: 'entity-1' }, { targetEntityId: 'entity-1' }],
        relations: ['sourceEntity', 'targetEntity', 'createdBy'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('getLinkedEntities', () => {
    it('должен возвращать связанные сущности с деталями', async () => {
      linkRepository.find.mockResolvedValue([mockLink]);

      const result = await service.getLinkedEntities('entity-1', 'both');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('entity-2');
      expect(result[0].linkType).toBe(EntityLinkType.SPAWNED);
    });

    it('должен фильтровать по направлению outgoing', async () => {
      linkRepository.find.mockResolvedValue([mockLink]);

      await service.getLinkedEntities('entity-1', 'outgoing');

      expect(linkRepository.find).toHaveBeenCalledWith({
        where: { sourceEntityId: 'entity-1' },
        relations: ['sourceEntity', 'targetEntity'],
      });
    });

    it('должен фильтровать по направлению incoming', async () => {
      linkRepository.find.mockResolvedValue([mockLink]);

      await service.getLinkedEntities('entity-1', 'incoming');

      expect(linkRepository.find).toHaveBeenCalledWith({
        where: { targetEntityId: 'entity-1' },
        relations: ['sourceEntity', 'targetEntity'],
      });
    });
  });

  describe('getLinksByType', () => {
    it('должен возвращать связи по типу', async () => {
      linkRepository.find.mockResolvedValue([mockLink]);

      const result = await service.getLinksByType('entity-1', EntityLinkType.SPAWNED);

      expect(result).toEqual([mockLink]);
      expect(linkRepository.find).toHaveBeenCalledWith({
        where: { sourceEntityId: 'entity-1', linkType: EntityLinkType.SPAWNED },
        relations: ['targetEntity'],
      });
    });
  });

  describe('deleteLink', () => {
    it('должен удалять связь', async () => {
      linkRepository.findOne.mockResolvedValue(mockLink);
      linkRepository.remove.mockResolvedValue(mockLink);

      await service.deleteLink('link-1');

      expect(linkRepository.remove).toHaveBeenCalledWith(mockLink);
    });

    it('должен выбрасывать NotFoundException если связь не найдена', async () => {
      linkRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteLink('unknown')).rejects.toThrow(NotFoundException);
    });

    it('должен удалять обратную связь для BLOCKS', async () => {
      const blocksLink = { ...mockLink, linkType: EntityLinkType.BLOCKS };
      linkRepository.findOne.mockResolvedValue(blocksLink);
      linkRepository.remove.mockResolvedValue(blocksLink);
      linkRepository.delete.mockResolvedValue({} as any);

      await service.deleteLink('link-1');

      expect(linkRepository.delete).toHaveBeenCalledWith({
        sourceEntityId: 'entity-2',
        targetEntityId: 'entity-1',
        linkType: EntityLinkType.BLOCKED_BY,
      });
    });
  });

  describe('deleteLinksForEntity', () => {
    it('должен удалять все связи сущности', async () => {
      linkRepository.delete.mockResolvedValue({ affected: 3 } as any);

      const result = await service.deleteLinksForEntity('entity-1');

      expect(result).toBe(3);
    });
  });

  describe('createLinkedEntity', () => {
    it('должен создавать сущность и связь', async () => {
      const createdEntity = { ...mockEntity, id: 'entity-new', customId: 'WS-100' };
      entityService.findOne.mockResolvedValue(mockEntity as any);
      entityService.create.mockResolvedValue(createdEntity as any);
      linkRepository.findOne.mockResolvedValue(null);
      linkRepository.create.mockReturnValue(mockLink);
      linkRepository.save.mockResolvedValue(mockLink);

      const result = await service.createLinkedEntity({
        sourceEntityId: 'entity-1',
        targetWorkspaceId: 'ws-2',
        title: 'New Entity',
        status: 'new',
        priority: 'high',
      });

      expect(result.entity).toEqual(createdEntity);
      expect(result.link).toEqual(mockLink);
      expect(entityService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-2',
          title: 'New Entity',
          priority: 'high',
        }),
        undefined,
      );
    });

    it('должен использовать SPAWNED по умолчанию', async () => {
      const createdEntity = { ...mockEntity, id: 'entity-new' };
      entityService.findOne.mockResolvedValue(mockEntity as any);
      entityService.create.mockResolvedValue(createdEntity as any);
      linkRepository.findOne.mockResolvedValue(null);
      linkRepository.create.mockReturnValue(mockLink);
      linkRepository.save.mockResolvedValue(mockLink);

      await service.createLinkedEntity({
        sourceEntityId: 'entity-1',
        targetWorkspaceId: 'ws-2',
        title: 'Test',
      });

      expect(linkRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          linkType: EntityLinkType.SPAWNED,
        }),
      );
    });
  });

  describe('getEntitiesByProcessInstance', () => {
    it('должен возвращать связи по processInstanceId', async () => {
      linkRepository.find.mockResolvedValue([mockLink]);

      const result = await service.getEntitiesByProcessInstance('process-1');

      expect(result).toEqual([mockLink]);
      expect(linkRepository.find).toHaveBeenCalledWith({
        where: { processInstanceId: 'process-1' },
        relations: ['sourceEntity', 'targetEntity'],
      });
    });
  });
});
