import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from './workspace.entity';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
  ) {}

  async findAll(): Promise<Workspace[]> {
    return this.workspaceRepository.find();
  }

  async findOne(id: string): Promise<Workspace | null> {
    return this.workspaceRepository.findOne({ where: { id } });
  }

  async create(workspaceData: Partial<Workspace>): Promise<Workspace> {
    const workspace = this.workspaceRepository.create(workspaceData);
    return this.workspaceRepository.save(workspace);
  }

  async update(id: string, workspaceData: Partial<Workspace>): Promise<Workspace | null> {
    await this.workspaceRepository.update(id, workspaceData);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.workspaceRepository.delete(id);
  }
}
