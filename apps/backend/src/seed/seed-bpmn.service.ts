import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { User } from '../modules/user/user.entity';
import { Workspace } from '../modules/workspace/workspace.entity';
import { WorkspaceEntity } from '../modules/entity/entity.entity';
import { ProcessDefinition } from '../modules/bpmn/entities/process-definition.entity';
import { ProcessTrigger, TriggerType } from '../modules/bpmn/entities/process-trigger.entity';
import { BpmnService } from '../modules/bpmn/bpmn.service';
import { SeedWorkspaces } from './seed-structure.service';
import { EMPLOYEES } from './data/employees';

// ──────────────────────────────────────────────────────
// Определения процессов для seed
// ──────────────────────────────────────────────────────

interface ProcessDefSeed {
  workspaceKey: string;
  name: string;
  description: string;
  processId: string;
  templateFile: string;
  /** Email менеджера, создающего определение */
  createdByEmail: string;
}

const PROCESS_DEFINITIONS: ProcessDefSeed[] = [
  {
    workspaceKey: 'zk',
    name: 'Обработка заявки клиента',
    description: 'Полный цикл обработки заявки: приём, квалификация, подготовка КП, согласование, оплата, отгрузка',
    processId: 'support-ticket',
    templateFile: 'support-ticket.bpmn',
    createdByEmail: 'grachev@stankoff.ru',
  },
  {
    workspaceKey: 'kp',
    name: 'Согласование КП',
    description: 'Процесс согласования коммерческого предложения с руководством',
    processId: 'simple-approval',
    templateFile: 'simple-approval.bpmn',
    createdByEmail: 'grachev@stankoff.ru',
  },
  {
    workspaceKey: 'sz',
    name: 'Сервисная заявка',
    description: 'Процесс обработки сервисной заявки: диагностика, ремонт, тестирование, выдача',
    processId: 'support-ticket-service',
    templateFile: 'support-ticket.bpmn',
    createdByEmail: 'andrey@stankoff.ru',
  },
  {
    workspaceKey: 'rek',
    name: 'Обработка рекламации',
    description: 'Процесс рассмотрения рекламации: расследование, решение, исполнение',
    processId: 'customer-complaint',
    templateFile: 'claims-management.bpmn',
    createdByEmail: 'andrey@stankoff.ru',
  },
  {
    workspaceKey: 'mk',
    name: 'Согласование маркетинговой задачи',
    description: 'Утверждение маркетинговых активностей руководителем отдела',
    processId: 'simple-approval-marketing',
    templateFile: 'simple-approval.bpmn',
    createdByEmail: 'yunona.salimzyanova@yandex.ru',
  },
  {
    workspaceKey: 'fd',
    name: 'Согласование финансового документа',
    description: 'Проверка и согласование финансовых документов: счетов, актов, накладных',
    processId: 'expense-approval',
    templateFile: 'expense-approval.bpmn',
    createdByEmail: 'chulpan@stankoff.ru',
  },
  {
    workspaceKey: 'sr',
    name: 'Многоуровневое согласование расходов',
    description: 'Многоуровневое согласование расходов: бюджет → руководитель → директор',
    processId: 'multi-level-approval',
    templateFile: 'multi-level-approval.bpmn',
    createdByEmail: 'aleksei.matveev@stankoff.ru',
  },
  {
    workspaceKey: 'dg',
    name: 'Согласование договора',
    description: 'Процесс рецензирования и согласования договоров',
    processId: 'document-review',
    templateFile: 'document-review.bpmn',
    createdByEmail: 'chulpan.gallyamova@stankoff.ru',
  },
  {
    workspaceKey: 'hr',
    name: 'Заявка на отпуск',
    description: 'Подача и согласование заявки на отпуск',
    processId: 'vacation-request',
    templateFile: 'vacation-request.bpmn',
    createdByEmail: 'anna.sidorova@stankoff.ru',
  },
  {
    workspaceKey: 'it',
    name: 'Запрос на изменение (IT)',
    description: 'Процесс управления изменениями в IT-инфраструктуре',
    processId: 'change-request',
    templateFile: 'change-request.bpmn',
    createdByEmail: 'youredik@gmail.com',
  },
];

// ──────────────────────────────────────────────────────
// SeedBpmnService
// ──────────────────────────────────────────────────────

@Injectable()
export class SeedBpmnService {
  private readonly logger = new Logger(SeedBpmnService.name);

  constructor(
    @InjectRepository(ProcessDefinition)
    private readonly procDefRepo: Repository<ProcessDefinition>,
    @InjectRepository(ProcessTrigger)
    private readonly triggerRepo: Repository<ProcessTrigger>,
    private readonly bpmnService: BpmnService,
  ) {}

  /**
   * Создать BPMN определения, развернуть в Zeebe, создать триггеры,
   * запустить процессы для некоторых сущностей.
   */
  async createAll(
    ws: SeedWorkspaces,
    itWorkspace: Workspace,
    users: User[],
    entities: Record<string, WorkspaceEntity[]>,
    itEntities: WorkspaceEntity[],
  ): Promise<void> {
    const userByEmail = new Map<string, User>();
    for (const u of users) {
      userByEmail.set(u.email, u);
    }

    // Маппинг workspace key → Workspace
    const wsMap: Record<string, Workspace> = {
      zk: ws.zk,
      kp: ws.kp,
      sz: ws.sz,
      rek: ws.rek,
      mk: ws.mk,
      kn: ws.kn,
      sk: ws.sk,
      dv: ws.dv,
      fd: ws.fd,
      sr: ws.sr,
      dg: ws.dg,
      ved: ws.ved,
      hr: ws.hr,
      tn: ws.tn,
      it: itWorkspace,
    };

    // Маппинг workspace key → entities
    const entitiesMap: Record<string, WorkspaceEntity[]> = {
      ...entities,
      it: itEntities,
    };

    // Чтение BPMN файлов
    const templatesDir = path.join(__dirname, '..', 'modules', 'bpmn', 'templates');
    const readBpmn = (filename: string): string => {
      try {
        return fs.readFileSync(path.join(templatesDir, filename), 'utf-8');
      } catch {
        return `<!-- ${filename} not found -->`;
      }
    };

    // Хранилище созданных определений для запуска процессов
    const createdDefs: Array<{ def: ProcessDefinition; wsKey: string }> = [];

    // 1. Создать определения процессов и развернуть
    for (const pdSeed of PROCESS_DEFINITIONS) {
      const workspace = wsMap[pdSeed.workspaceKey];
      if (!workspace) {
        this.logger.warn(`Workspace "${pdSeed.workspaceKey}" не найден, пропускаю ${pdSeed.processId}`);
        continue;
      }

      const createdBy = userByEmail.get(pdSeed.createdByEmail);
      const bpmnXml = readBpmn(pdSeed.templateFile);

      const def = await this.procDefRepo.save(
        this.procDefRepo.create({
          workspaceId: workspace.id,
          name: pdSeed.name,
          description: pdSeed.description,
          processId: pdSeed.processId,
          bpmnXml,
          version: 1,
          isActive: true,
          isDefault: true,
          createdById: createdBy?.id,
        }),
      );

      this.logger.debug(`  Определение создано: ${pdSeed.processId} (${pdSeed.name})`);

      // Deploy в Zeebe
      try {
        await this.bpmnService.deployDefinition(def.id);
        this.logger.log(`  Deployed: ${pdSeed.processId}`);
      } catch (e) {
        this.logger.warn(`  Не удалось deploy ${pdSeed.processId}: ${e.message}`);
      }

      createdDefs.push({ def, wsKey: pdSeed.workspaceKey });

      // 2. Создать триггер auto_on_create для каждого определения
      await this.triggerRepo.save(
        this.triggerRepo.create({
          workspaceId: workspace.id,
          processDefinitionId: def.id,
          triggerType: TriggerType.ENTITY_CREATED,
          name: `Автозапуск: ${pdSeed.name}`,
          description: `Автоматический запуск процесса "${pdSeed.name}" при создании заявки в workspace`,
          isActive: true,
          conditions: {},
          variableMappings: {},
          createdById: createdBy?.id,
        }),
      );
    }

    this.logger.log(`Создано ${createdDefs.length} определений процессов с триггерами`);

    // 3. Запустить процессы для некоторых сущностей
    await this.startProcessesForEntities(createdDefs, entitiesMap, userByEmail);
  }

  // ──────────────────────────────────────────────────────
  // Запуск процессов для подмножества сущностей
  // ──────────────────────────────────────────────────────

  private async startProcessesForEntities(
    defs: Array<{ def: ProcessDefinition; wsKey: string }>,
    entitiesMap: Record<string, WorkspaceEntity[]>,
    userByEmail: Map<string, User>,
  ): Promise<void> {
    let started = 0;
    let failed = 0;

    // Для каждого определения берём 2-3 сущности из соответствующего workspace
    for (const { def, wsKey } of defs) {
      const wsEntities = entitiesMap[wsKey];
      if (!wsEntities || wsEntities.length === 0) continue;

      // Выбираем 2 сущности из начала списка (завершённые/активные — зависит от данных)
      const toStart = wsEntities.slice(0, Math.min(2, wsEntities.length));

      // Находим менеджера отдела для startedById
      const pdSeed = PROCESS_DEFINITIONS.find((p) => p.processId === def.processId);
      const managerUser = pdSeed ? userByEmail.get(pdSeed.createdByEmail) : undefined;

      for (const entity of toStart) {
        try {
          await this.bpmnService.startProcess(
            def.id,
            {
              entityId: entity.id,
              entityTitle: entity.title,
              entityStatus: entity.status,
              entityPriority: entity.priority || '',
              workspaceId: def.workspaceId,
            },
            {
              entityId: entity.id,
              businessKey: entity.customId,
              startedById: managerUser?.id,
            },
          );
          started++;
        } catch (e) {
          this.logger.warn(`  Не удалось запустить процесс для ${entity.customId}: ${e.message}`);
          failed++;
        }
      }
    }

    this.logger.log(`Процессы запущены: ${started} успешно, ${failed} ошибок`);
  }
}
