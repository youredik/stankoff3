import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../modules/user/user.entity';
import { Workspace } from '../modules/workspace/workspace.entity';
import { WorkspaceEntity } from '../modules/entity/entity.entity';
import { WorkspaceMember, WorkspaceRole } from '../modules/workspace/workspace-member.entity';
import { Section } from '../modules/section/section.entity';
import { SectionMember, SectionRole } from '../modules/section/section-member.entity';
import { ProductCategory } from '../modules/entity/product-category.entity';
import { SystemSyncService } from '../modules/legacy/services/system-sync.service';

@Injectable()
export class SeedSystemWorkspacesService {
  private readonly logger = new Logger(SeedSystemWorkspacesService.name);

  constructor(
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
    @InjectRepository(SectionMember)
    private readonly secMemberRepo: Repository<SectionMember>,
    @InjectRepository(Workspace)
    private readonly wsRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceEntity)
    private readonly entityRepo: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    private readonly systemSyncService: SystemSyncService,
  ) {}

  /**
   * Создать секцию "Справочники" + 3 системных workspace + демо-данные
   */
  async createAll(sections: Section[], users: User[]): Promise<void> {
    // 1. Создать секцию "Справочники" (первая в списке)
    const section = await this.createReferenceSection();

    // 2. Создать системные workspace через SystemSyncService
    const { counterparties, contacts, products } =
      await this.systemSyncService.ensureAllWorkspaces();

    // 3. Привязать workspace к секции
    await this.wsRepo.update(counterparties.id, { sectionId: section.id, orderInSection: 0 });
    await this.wsRepo.update(contacts.id, { sectionId: section.id, orderInSection: 1 });
    await this.wsRepo.update(products.id, { sectionId: section.id, orderInSection: 2 });

    // 4. Добавить участников (все админы → ADMIN, остальные → EDITOR)
    await this.createMembers(users, section, [counterparties, contacts, products]);

    // 5. Демо-данные
    await this.createDemoCounterparties(counterparties, users);
    const counterpartyEntities = await this.entityRepo.find({
      where: { workspaceId: counterparties.id },
    });
    await this.createDemoContacts(contacts, counterparties, counterpartyEntities, users);
    await this.createDemoCategories(products);
    await this.createDemoProducts(products, users);

    this.logger.log(
      `Системные workspace: секция "${section.name}", ` +
      `CO (${counterparties.prefix}), CT (${contacts.prefix}), PR (${products.prefix})`,
    );
  }

  // ──────────────────────────────────────────────────
  // Секция "Справочники"
  // ──────────────────────────────────────────────────

  private async createReferenceSection(): Promise<Section> {
    return this.sectionRepo.save({
      name: 'CRM',
      description: 'Контрагенты, контакты, каталог товаров',
      icon: '💼',
      order: 0, // Первая в списке
    });
  }

  // ──────────────────────────────────────────────────
  // Участники
  // ──────────────────────────────────────────────────

  private async createMembers(
    users: User[],
    section: Section,
    workspaces: Workspace[],
  ): Promise<void> {
    const wsMemberEntities: Partial<WorkspaceMember>[] = [];
    const secMemberEntities: Partial<SectionMember>[] = [];

    for (const user of users) {
      // Все пользователи получают доступ к справочникам (viewer/editor)
      const isAdmin = user.role === 'admin' || user.role === 'manager';
      const wsRole = isAdmin ? WorkspaceRole.ADMIN : WorkspaceRole.EDITOR;

      for (const ws of workspaces) {
        wsMemberEntities.push({ workspaceId: ws.id, userId: user.id, role: wsRole });
      }

      if (isAdmin) {
        secMemberEntities.push({ sectionId: section.id, userId: user.id, role: SectionRole.ADMIN });
      }
    }

    if (wsMemberEntities.length > 0) {
      await this.wsMemberRepo.save(wsMemberEntities);
    }
    if (secMemberEntities.length > 0) {
      await this.secMemberRepo.save(secMemberEntities);
    }

    this.logger.debug(`  Участники справочников: ${wsMemberEntities.length} ws members, ${secMemberEntities.length} section members`);
  }

  // ──────────────────────────────────────────────────
  // Демо: Контрагенты (10)
  // ──────────────────────────────────────────────────

  private async createDemoCounterparties(ws: Workspace, users: User[]): Promise<void> {
    const counterparties = [
      { num: 1, title: 'ООО ТехноЛазер', status: 'active', data: { inn: '7701234567', kpp: '770101001', ogrn: '1037700123456', orgType: 'legal', director: 'Иванов И.И.', website: 'https://technolaser.ru', address: 'г. Москва, ул. Промышленная, 15', legacyId: 1001 } },
      { num: 2, title: 'ИП Петров Алексей Владимирович', status: 'active', data: { inn: '771234567890', orgType: 'individual', address: 'г. Москва, ул. Ленина, 42', legacyId: 1002 } },
      { num: 3, title: 'АО Промзавод', status: 'active', data: { inn: '7801234567', kpp: '780101001', ogrn: '1037800123456', orgType: 'legal', director: 'Сидоров П.А.', website: 'https://promzavod.ru', address: 'г. Санкт-Петербург, пр. Обуховской Обороны, 120', legacyId: 1003 } },
      { num: 4, title: 'ООО МеталлСервис', status: 'active', data: { inn: '5001234567', kpp: '500101001', orgType: 'legal', director: 'Козлов В.Н.', website: 'https://metallservice.ru', address: 'Московская обл., г. Подольск, ул. Заводская, 5', legacyId: 1004 } },
      { num: 5, title: 'ООО МебельГрупп', status: 'active', data: { inn: '6301234567', kpp: '630101001', orgType: 'legal', director: 'Морозов А.В.', address: 'г. Самара, ул. Авроры, 88', legacyId: 1005 } },
      { num: 6, title: 'ЗАО Лазермет', status: 'inactive', data: { inn: '7201234567', kpp: '720101001', orgType: 'legal', director: 'Тихонов С.В.', address: 'г. Тюмень, ул. Республики, 200', legacyId: 1006 } },
      { num: 7, title: 'ООО СтальПром', status: 'active', data: { inn: '1601234567', kpp: '160101001', orgType: 'legal', director: 'Фёдоров Д.М.', website: 'https://stalprom.ru', address: 'г. Казань, ул. Баумана, 55', legacyId: 1007 } },
      { num: 8, title: 'ООО ПринтТех', status: 'active', data: { inn: '5401234567', kpp: '540101001', orgType: 'legal', director: 'Алексеев Р.С.', address: 'г. Новосибирск, ул. Кирова, 30', legacyId: 1008 } },
      { num: 9, title: 'Соколов Виктор Игоревич', status: 'active', data: { inn: '772345678901', orgType: 'person', address: 'г. Москва, ул. Тверская, 12', legacyId: 1009 } },
      { num: 10, title: 'ООО Станкоимпорт', status: 'liquidated', data: { inn: '4001234567', kpp: '400101001', orgType: 'legal', director: 'Павлов Е.А.', address: 'г. Калуга, ул. Кирова, 10', legacyId: 1010 } },
    ];

    const entities: Partial<WorkspaceEntity>[] = counterparties.map((cp) => ({
      id: uuidv4(),
      customId: `CO-${cp.num}`,
      workspaceId: ws.id,
      title: cp.title,
      status: cp.status,
      data: cp.data,
      linkedEntityIds: [],
      commentCount: 0,
    }));

    await this.entityRepo.save(entities);
    await this.wsRepo.update(ws.id, { lastEntityNumber: counterparties.length });
    this.logger.debug(`  Демо-контрагенты: ${counterparties.length}`);
  }

  // ──────────────────────────────────────────────────
  // Демо: Контакты (15)
  // ──────────────────────────────────────────────────

  private async createDemoContacts(
    ws: Workspace,
    cpWs: Workspace,
    cpEntities: WorkspaceEntity[],
    users: User[],
  ): Promise<void> {
    // Маппинг по customId для relation
    const cpMap = new Map(cpEntities.map((e) => [e.customId, e]));

    const makeRelation = (customId: string) => {
      const cp = cpMap.get(customId);
      if (!cp) return null;
      return { id: cp.id, customId: cp.customId, workspaceId: cpWs.id };
    };

    const contacts = [
      { num: 1, title: 'Иванов Иван Иванович', status: 'active', data: { email: 'ivanov@technolaser.ru', phone: '+7 (495) 123-45-67', position: 'Генеральный директор', telegram: '@ivanov_tl', counterparty: makeRelation('CO-1'), legacyId: 2001, isEmployee: false } },
      { num: 2, title: 'Смирнова Ольга Петровна', status: 'active', data: { email: 'smirnova@technolaser.ru', phone: '+7 (495) 123-45-68', position: 'Менеджер по закупкам', counterparty: makeRelation('CO-1'), legacyId: 2002, isEmployee: false } },
      { num: 3, title: 'Петров Алексей Владимирович', status: 'active', data: { email: 'petrov@mail.ru', phone: '+7 (916) 234-56-78', position: 'Индивидуальный предприниматель', telegram: '@petrov_av', counterparty: makeRelation('CO-2'), legacyId: 2003, isEmployee: false } },
      { num: 4, title: 'Кузнецов Андрей Михайлович', status: 'active', data: { email: 'kuznetsov@promzavod.ru', phone: '+7 (812) 345-67-89', position: 'Технический директор', counterparty: makeRelation('CO-3'), legacyId: 2004, isEmployee: false } },
      { num: 5, title: 'Попова Елена Сергеевна', status: 'active', data: { email: 'popova@promzavod.ru', phone: '+7 (812) 345-67-90', position: 'Начальник отдела снабжения', counterparty: makeRelation('CO-3'), legacyId: 2005, isEmployee: false } },
      { num: 6, title: 'Козлов Виктор Николаевич', status: 'active', data: { email: 'kozlov@metallservice.ru', phone: '+7 (496) 456-78-90', position: 'Директор', telegram: '@kozlov_ms', counterparty: makeRelation('CO-4'), legacyId: 2006, isEmployee: false } },
      { num: 7, title: 'Морозов Алексей Владимирович', status: 'active', data: { email: 'morozov@mebelgroup.ru', phone: '+7 (846) 567-89-01', position: 'Генеральный директор', counterparty: makeRelation('CO-5'), legacyId: 2007, isEmployee: false } },
      { num: 8, title: 'Новикова Марина Дмитриевна', status: 'active', data: { email: 'novikova@mebelgroup.ru', phone: '+7 (846) 567-89-02', position: 'Бухгалтер', counterparty: makeRelation('CO-5'), legacyId: 2008, isEmployee: false } },
      { num: 9, title: 'Тихонов Сергей Владимирович', status: 'inactive', data: { email: 'tikhonov@lazermet.ru', phone: '+7 (345) 678-90-12', position: 'Коммерческий директор', counterparty: makeRelation('CO-6'), legacyId: 2009, isEmployee: false } },
      { num: 10, title: 'Фёдоров Дмитрий Михайлович', status: 'active', data: { email: 'fedorov@stalprom.ru', phone: '+7 (843) 789-01-23', position: 'Главный инженер', telegram: '@fedorov_sp', counterparty: makeRelation('CO-7'), legacyId: 2010, isEmployee: false } },
      { num: 11, title: 'Алексеев Роман Сергеевич', status: 'active', data: { email: 'alekseev@printtech.ru', phone: '+7 (383) 890-12-34', position: 'Руководитель отдела продаж', counterparty: makeRelation('CO-8'), legacyId: 2011, isEmployee: false } },
      { num: 12, title: 'Соколов Виктор Игоревич', status: 'active', data: { email: 'sokolov.vi@mail.ru', phone: '+7 (903) 901-23-45', counterparty: makeRelation('CO-9'), legacyId: 2012, isEmployee: false } },
      { num: 13, title: 'Волков Артём Павлович', status: 'active', data: { email: 'volkov@stankoimport.ru', phone: '+7 (484) 012-34-56', position: 'Менеджер ВЭД', counterparty: makeRelation('CO-10'), legacyId: 2013, isEmployee: false } },
      { num: 14, title: 'Лебедев Максим Андреевич', status: 'active', data: { email: 'lebedev@technolaser.ru', phone: '+7 (495) 123-45-69', position: 'Инженер-наладчик', counterparty: makeRelation('CO-1'), legacyId: 2014, isEmployee: false } },
      { num: 15, title: 'Егорова Анна Викторовна', status: 'active', data: { email: 'egorova@metallservice.ru', phone: '+7 (496) 456-78-91', position: 'Менеджер по работе с клиентами', counterparty: makeRelation('CO-4'), legacyId: 2015, isEmployee: false } },
    ];

    const entities: Partial<WorkspaceEntity>[] = contacts.map((ct) => ({
      id: uuidv4(),
      customId: `CT-${ct.num}`,
      workspaceId: ws.id,
      title: ct.title,
      status: ct.status,
      data: ct.data,
      linkedEntityIds: [],
      commentCount: 0,
    }));

    await this.entityRepo.save(entities);
    await this.wsRepo.update(ws.id, { lastEntityNumber: contacts.length });
    this.logger.debug(`  Демо-контакты: ${contacts.length}`);
  }

  // ──────────────────────────────────────────────────
  // Демо: Категории товаров
  // ──────────────────────────────────────────────────

  private async createDemoCategories(ws: Workspace): Promise<void> {
    // Корневые категории
    const metalWorking = await this.categoryRepo.save(this.categoryRepo.create({
      name: 'Металлообработка', slug: 'metalworking', workspaceId: ws.id, sortOrder: 0, productCount: 0, isActive: true,
    }));
    const additive = await this.categoryRepo.save(this.categoryRepo.create({
      name: 'Аддитивные технологии', slug: 'additive', workspaceId: ws.id, sortOrder: 1, productCount: 0, isActive: true,
    }));

    // Подкатегории металлообработки
    const categories = [
      { name: 'Лазерные станки', slug: 'laser', parentId: metalWorking.id, sortOrder: 0, productCount: 2 },
      { name: 'Токарные станки', slug: 'lathe', parentId: metalWorking.id, sortOrder: 1, productCount: 1 },
      { name: 'Фрезерные станки', slug: 'milling', parentId: metalWorking.id, sortOrder: 2, productCount: 1 },
      { name: 'Листогибочные прессы', slug: 'press-brake', parentId: metalWorking.id, sortOrder: 3, productCount: 1 },
      { name: 'Плазменные станки', slug: 'plasma', parentId: metalWorking.id, sortOrder: 4, productCount: 1 },
      { name: 'Гильотинные ножницы', slug: 'shear', parentId: metalWorking.id, sortOrder: 5, productCount: 1 },
      { name: 'Ленточнопильные станки', slug: 'bandsaw', parentId: metalWorking.id, sortOrder: 6, productCount: 1 },
      { name: 'Координатно-пробивные прессы', slug: 'punch', parentId: metalWorking.id, sortOrder: 7, productCount: 1 },
      { name: 'Сверлильные станки', slug: 'drill', parentId: metalWorking.id, sortOrder: 8, productCount: 1 },
      { name: 'Вальцы', slug: 'rolls', parentId: metalWorking.id, sortOrder: 9, productCount: 1 },
      { name: 'Шлифовальные станки', slug: 'grinding', parentId: metalWorking.id, sortOrder: 10, productCount: 1 },
      { name: 'Электроэрозионные станки', slug: 'edm', parentId: metalWorking.id, sortOrder: 11, productCount: 1 },
      { name: 'Гидравлические прессы', slug: 'hydraulic-press', parentId: metalWorking.id, sortOrder: 12, productCount: 1 },
      { name: '3D-принтеры', slug: '3d-printers', parentId: additive.id, sortOrder: 0, productCount: 1 },
    ];

    await this.categoryRepo.save(
      categories.map((c) => this.categoryRepo.create({ ...c, workspaceId: ws.id, isActive: true })),
    );

    this.logger.debug(`  Демо-категории: ${categories.length + 2}`);
  }

  // ──────────────────────────────────────────────────
  // Демо: Товары (15)
  // ──────────────────────────────────────────────────

  private async createDemoProducts(ws: Workspace, users: User[]): Promise<void> {
    const products = [
      { num: 1, title: 'Лазерный станок OPC-1530', status: 'active', data: { productCode: 'OPC-1530', price: 3500000, basePrice: 3200000, fobPrice: 28000, warranty: 24, description: 'Лазерный станок для резки металла мощностью 1500 Вт, рабочее поле 1500×3000 мм', category: 'Лазерные станки', factoryName: 'Bodor', inStock: 3, legacyId: 3001 } },
      { num: 2, title: 'Токарный станок CK6140', status: 'active', data: { productCode: 'CK6140', price: 1200000, basePrice: 1050000, fobPrice: 9500, warranty: 12, description: 'Универсальный токарный станок с ЧПУ, макс. диаметр 400 мм', category: 'Токарные станки', factoryName: 'DMTG', inStock: 5, legacyId: 3002 } },
      { num: 3, title: 'Фрезерный станок VMC850', status: 'active', data: { productCode: 'VMC850', price: 4500000, basePrice: 4100000, fobPrice: 38000, warranty: 18, description: 'Вертикальный фрезерный обрабатывающий центр, ход X/Y/Z 850/500/550 мм', category: 'Фрезерные станки', factoryName: 'SMTCL', inStock: 2, legacyId: 3003 } },
      { num: 4, title: 'Листогиб HPB-100/3200', status: 'active', data: { productCode: 'HPB-100', price: 2800000, basePrice: 2500000, fobPrice: 22000, warranty: 24, description: 'Гидравлический листогибочный пресс, усилие 100 т, длина гиба 3200 мм', category: 'Листогибочные прессы', factoryName: 'Yawei', inStock: 1, legacyId: 3004 } },
      { num: 5, title: 'Плазменный станок PL-1530', status: 'out_of_stock', data: { productCode: 'PL-1530', price: 1800000, basePrice: 1600000, fobPrice: 14000, warranty: 12, description: 'Станок плазменной резки с ЧПУ, рабочее поле 1500×3000 мм', category: 'Плазменные станки', factoryName: 'Hypertherm', inStock: 0, legacyId: 3005 } },
      { num: 6, title: 'Гильотина QC11Y-16x2500', status: 'active', data: { productCode: 'QC11Y-16', price: 1500000, basePrice: 1300000, warranty: 18, description: 'Гидравлические гильотинные ножницы, толщина реза до 16 мм', category: 'Гильотинные ножницы', factoryName: 'Nanjing', inStock: 4, legacyId: 3006 } },
      { num: 7, title: 'Ленточнопильный станок GW4240', status: 'active', data: { productCode: 'GW4240', price: 650000, basePrice: 580000, fobPrice: 5200, warranty: 12, description: 'Полуавтоматический ленточнопильный станок, макс. сечение реза 400×400 мм', category: 'Ленточнопильные станки', factoryName: 'COSEN', inStock: 7, legacyId: 3007 } },
      { num: 8, title: 'Координатно-пробивной пресс VT-300', status: 'active', data: { productCode: 'VT-300', price: 8200000, basePrice: 7500000, fobPrice: 68000, warranty: 24, description: 'Координатно-пробивной пресс с сервоприводом, усилие 300 кН', category: 'Координатно-пробивные прессы', factoryName: 'Yawei', inStock: 1, legacyId: 3008 } },
      { num: 9, title: 'Сверлильный станок Z3050x16', status: 'active', data: { productCode: 'Z3050x16', price: 420000, basePrice: 380000, warranty: 12, description: 'Радиально-сверлильный станок, макс. диаметр сверления 50 мм', category: 'Сверлильные станки', factoryName: 'WMW', inStock: 10, legacyId: 3009 } },
      { num: 10, title: 'Лазерная труборезка LT-6020', status: 'out_of_stock', data: { productCode: 'LT-6020', price: 5600000, basePrice: 5100000, fobPrice: 46000, warranty: 24, description: 'Лазерная труборезка с ЧПУ, макс. диаметр трубы 200 мм, длина 6000 мм', category: 'Лазерные станки', factoryName: 'HSG', inStock: 0, legacyId: 3010 } },
      { num: 11, title: 'Вальцы W11-20x2500', status: 'active', data: { productCode: 'W11-20', price: 1100000, basePrice: 950000, warranty: 18, description: 'Трёхвалковые вальцы симметричные, толщина листа до 20 мм, длина 2500 мм', category: 'Вальцы', factoryName: 'Nantong', inStock: 2, legacyId: 3011 } },
      { num: 12, title: 'Шлифовальный станок M7130', status: 'disabled', data: { productCode: 'M7130', price: 780000, basePrice: 700000, warranty: 12, description: 'Плоскошлифовальный станок, размер стола 300×1000 мм', category: 'Шлифовальные станки', factoryName: 'SMTCL', inStock: 0, legacyId: 3012 } },
      { num: 13, title: 'Электроэрозионный станок DK7740', status: 'active', data: { productCode: 'DK7740', price: 2200000, basePrice: 1950000, fobPrice: 17500, warranty: 12, description: 'Электроэрозионный проволочно-вырезной станок с ЧПУ', category: 'Электроэрозионные станки', factoryName: 'Suzhou', inStock: 1, legacyId: 3013 } },
      { num: 14, title: 'Гидравлический пресс YQ32-200', status: 'active', data: { productCode: 'YQ32-200', price: 1900000, basePrice: 1700000, fobPrice: 15000, warranty: 18, description: 'Четырёхколонный гидравлический пресс, усилие 200 т', category: 'Гидравлические прессы', factoryName: 'Yangli', inStock: 3, legacyId: 3014 } },
      { num: 15, title: '3D-принтер промышленный SLM-280', status: 'active', data: { productCode: 'SLM-280', price: 12000000, basePrice: 11000000, fobPrice: 98000, warranty: 12, description: 'Промышленный 3D-принтер для печати металлом (SLM), область построения 280×280×365 мм', category: '3D-принтеры', factoryName: 'SLM Solutions', inStock: 1, legacyId: 3015 } },
    ];

    const entities: Partial<WorkspaceEntity>[] = products.map((pr) => ({
      id: uuidv4(),
      customId: `PR-${pr.num}`,
      workspaceId: ws.id,
      title: pr.title,
      status: pr.status,
      data: pr.data,
      linkedEntityIds: [],
      commentCount: 0,
    }));

    await this.entityRepo.save(entities);
    await this.wsRepo.update(ws.id, { lastEntityNumber: products.length });
    this.logger.debug(`  Демо-товары: ${products.length}`);
  }
}
