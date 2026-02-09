import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormDefinition } from '../entities/form-definition.entity';
import { CreateFormDefinitionDto, UpdateFormDefinitionDto } from './dto/form-definition.dto';

@Injectable()
export class FormDefinitionsService {
  private readonly logger = new Logger(FormDefinitionsService.name);

  constructor(
    @InjectRepository(FormDefinition)
    private formRepository: Repository<FormDefinition>,
  ) {}

  async create(dto: CreateFormDefinitionDto, userId: string): Promise<FormDefinition> {
    // Check key uniqueness within workspace
    const existing = await this.formRepository.findOne({
      where: { workspaceId: dto.workspaceId, key: dto.key },
    });
    if (existing) {
      throw new ConflictException(
        `Form with key "${dto.key}" already exists in this workspace`,
      );
    }

    const form = this.formRepository.create({
      ...dto,
      createdById: userId,
      version: 1,
    });

    return this.formRepository.save(form);
  }

  async findAll(workspaceId: string): Promise<FormDefinition[]> {
    return this.formRepository.find({
      where: { workspaceId },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<FormDefinition> {
    const form = await this.formRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!form) {
      throw new NotFoundException(`Form definition ${id} not found`);
    }
    return form;
  }

  async findByKey(key: string, workspaceId: string): Promise<FormDefinition | null> {
    // Workspace-specific first
    let form = await this.formRepository.findOne({
      where: { key, workspaceId },
    });
    if (!form) {
      // Fallback to global
      form = await this.formRepository
        .createQueryBuilder('form')
        .where('form.key = :key AND form."workspaceId" IS NULL', { key })
        .getOne();
    }
    return form;
  }

  async update(id: string, dto: UpdateFormDefinitionDto): Promise<FormDefinition> {
    const form = await this.findOne(id);

    // Increment version if schema changes
    if (dto.schema) {
      (dto as any).version = form.version + 1;
    }

    // Check key uniqueness if key is being changed
    if (dto.key && dto.key !== form.key) {
      const existing = await this.formRepository.findOne({
        where: { workspaceId: form.workspaceId ?? undefined, key: dto.key },
      });
      if (existing) {
        throw new ConflictException(
          `Form with key "${dto.key}" already exists in this workspace`,
        );
      }
    }

    Object.assign(form, dto);
    return this.formRepository.save(form);
  }

  async delete(id: string): Promise<void> {
    const form = await this.findOne(id);
    await this.formRepository.remove(form);
  }
}
