import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Section } from '../modules/section/section.entity';
import { BpmnService } from '../modules/bpmn/bpmn.service';
import { SeedCleanupService } from './seed-cleanup.service';
import { SeedUsersService } from './seed-users.service';
import { SeedKeycloakService } from './seed-keycloak.service';
import { SeedStructureService } from './seed-structure.service';
import { SeedEntitiesService } from './seed-entities.service';
import { SeedItDepartmentService } from './seed-it-department.service';
import { SeedRbacService } from './seed-rbac.service';
import { SeedBpmnService } from './seed-bpmn.service';
import { SeedSlaDmnService } from './seed-sla-dmn.service';

@Injectable()
export class SeedOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(SeedOrchestratorService.name);

  constructor(
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
    private readonly bpmnService: BpmnService,
    private readonly cleanup: SeedCleanupService,
    private readonly seedUsers: SeedUsersService,
    private readonly seedRbac: SeedRbacService,
    private readonly seedKeycloak: SeedKeycloakService,
    private readonly seedStructure: SeedStructureService,
    private readonly seedEntities: SeedEntitiesService,
    private readonly seedItDept: SeedItDepartmentService,
    private readonly seedBpmn: SeedBpmnService,
    private readonly seedSlaDmn: SeedSlaDmnService,
  ) {}

  async onModuleInit(): Promise<void> {
    // 0. Защита от запуска на production/preprod — seed только при явном ENABLE_SEED=true
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SEED !== 'true') {
      this.logger.log(
        `Seed отключён (NODE_ENV=${process.env.NODE_ENV}, ENABLE_SEED=${process.env.ENABLE_SEED || 'not set'})`,
      );
      return;
    }

    // 1. Проверка маркера: если секция "Продажи" существует — данные уже созданы
    const existing = await this.sectionRepo.findOne({ where: { name: 'Продажи' } });
    if (existing) {
      this.logger.log('Seed данные уже существуют, пропускаю');
      return;
    }

    const startTime = Date.now();
    this.logger.log('=== Запуск полного seed ===');

    // 2. Ожидание подключения к Zeebe (30 секунд)
    let zeebeAvailable = false;
    this.logger.log('Ожидание подключения к Zeebe...');
    try {
      await this.bpmnService.waitForConnection(30000);
      this.logger.log('Zeebe подключён');
      zeebeAvailable = true;
    } catch {
      this.logger.warn('Zeebe недоступен — BPMN процессы будут пропущены');
    }

    // 3. Полная очистка всех данных
    this.logger.log('Очистка ВСЕХ существующих данных...');
    await this.cleanup.cleanupAll();

    // 4. Создание пользователей (87)
    this.logger.log('Создание пользователей...');
    const users = await this.seedUsers.createAll();

    // 5. RBAC фаза 1: системные роли + глобальные назначения
    this.logger.log('Создание RBAC ролей...');
    await this.seedRbac.seedRolesAndGlobal(users);

    // 6. Регистрация в Keycloak (опционально)
    this.logger.log('Синхронизация с Keycloak...');
    await this.seedKeycloak.syncUsers(users);

    // 7. Создание секций + workspace + участников
    this.logger.log('Создание секций, workspace, участников...');
    const { sections, workspaces } = await this.seedStructure.createAll(users);

    // 7.1 RBAC фаза 2: назначение workspace/section ролей
    this.logger.log('Назначение RBAC ролей для membership...');
    await this.seedRbac.seedMembershipRoles();

    // 8. Создание сущностей + комментариев
    this.logger.log('Создание сущностей и комментариев...');
    const entities = await this.seedEntities.createAll(workspaces, users);

    // 9. Создание IT-отдела (отдельный workspace)
    this.logger.log('Создание IT workspace...');
    const itSection = sections.find((s) => s.name === 'IT');
    if (!itSection) {
      this.logger.error('Секция "IT" не найдена! Пропускаю создание IT workspace.');
      return;
    }
    const { workspace: itWs, entities: itEntities } = await this.seedItDept.createAll(users, itSection);

    // 10. BPMN определения + deploy + триггеры + запуск процессов
    if (zeebeAvailable) {
      this.logger.log('Создание BPMN определений и процессов...');
      try {
        await this.seedBpmn.createAll(workspaces, itWs, users, entities, itEntities);
      } catch (e) {
        this.logger.warn(`Ошибка BPMN seed (не критично): ${e.message}`);
      }
    } else {
      this.logger.log('BPMN seed пропущен — Zeebe недоступен');
    }

    // 11. SLA + DMN
    this.logger.log('Создание SLA определений и DMN таблиц...');
    try {
      await this.seedSlaDmn.createAll(workspaces, itWs, users);
    } catch (e) {
      this.logger.warn(`Ошибка SLA/DMN seed (не критично): ${e.message}`);
    }

    // 12. Итог
    const totalEntities = Object.values(entities).reduce(
      (sum, arr) => sum + arr.length,
      0,
    ) + itEntities.length;
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    this.logger.log(
      `=== Seed завершён за ${durationSec}с: ` +
        `${users.length} пользователей, ` +
        `${sections.length} секций, ` +
        `${Object.keys(workspaces).length + 1} workspace, ` +
        `${totalEntities} сущностей ===`,
    );
  }
}
