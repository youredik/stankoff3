import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './modules/user/user.entity';
import { WorkspaceEntity } from './modules/entity/entity.entity';
import { Workspace } from './modules/workspace/workspace.entity';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(WorkspaceEntity)
    private entityRepository: Repository<WorkspaceEntity>,
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
  ) {}

  async onModuleInit() {
    const userCount = await this.userRepository.count();
    if (userCount > 0) return;

    // Создаём пользователей
    const users = await this.userRepository.save([
      {
        email: 'ivanov@stankoff.ru',
        password: 'password',
        firstName: 'Иван',
        lastName: 'Иванов',
        role: UserRole.EMPLOYEE,
        department: 'IT',
      },
      {
        email: 'petrova@stankoff.ru',
        password: 'password',
        firstName: 'Мария',
        lastName: 'Петрова',
        role: UserRole.EMPLOYEE,
        department: 'IT',
      },
      {
        email: 'sidorov@stankoff.ru',
        password: 'password',
        firstName: 'Петр',
        lastName: 'Сидоров',
        role: UserRole.MANAGER,
        department: 'IT',
      },
      {
        email: 'admin@stankoff.ru',
        password: 'password',
        firstName: 'Админ',
        lastName: 'Станкофф',
        role: UserRole.ADMIN,
        department: 'Management',
      },
    ]);

    // Рабочее место: Техническая поддержка
    const techSupport = await this.workspaceRepository.save({
      name: 'Техническая поддержка',
      icon: '🔧',
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            {
              id: 'title',
              name: 'Тема заявки',
              type: 'text',
              required: true,
            },
            {
              id: 'status',
              name: 'Статус',
              type: 'status',
              required: true,
              options: [
                { id: 'new', label: 'Новая', color: '#3B82F6' },
                { id: 'in-progress', label: 'В работе', color: '#F59E0B' },
                { id: 'testing', label: 'Тестирование', color: '#8B5CF6' },
                { id: 'done', label: 'Готово', color: '#10B981' },
              ],
            },
            {
              id: 'priority',
              name: 'Приоритет',
              type: 'select',
              options: [
                { id: 'low', label: 'Низкий', color: '#10B981' },
                { id: 'medium', label: 'Средний', color: '#F59E0B' },
                { id: 'high', label: 'Высокий', color: '#EF4444' },
              ],
            },
            {
              id: 'assignee',
              name: 'Исполнитель',
              type: 'user',
            },
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            {
              id: 'description',
              name: 'Описание проблемы',
              type: 'text',
              description: 'Подробное описание проблемы',
            },
            {
              id: 'department',
              name: 'Отдел',
              type: 'select',
              options: [
                { id: 'it', label: 'IT', color: '#3B82F6' },
                { id: 'hr', label: 'HR', color: '#EC4899' },
                { id: 'finance', label: 'Финансы', color: '#10B981' },
                { id: 'marketing', label: 'Маркетинг', color: '#F59E0B' },
              ],
            },
            {
              id: 'deadline',
              name: 'Срок выполнения',
              type: 'date',
            },
          ],
        },
      ],
    });

    // Рабочее место: Рекламации
    const complaints = await this.workspaceRepository.save({
      name: 'Рекламации',
      icon: '⚠️',
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            {
              id: 'title',
              name: 'Название рекламации',
              type: 'text',
              required: true,
            },
            {
              id: 'status',
              name: 'Статус',
              type: 'status',
              required: true,
              options: [
                { id: 'received', label: 'Получена', color: '#3B82F6' },
                { id: 'investigation', label: 'Расследование', color: '#F59E0B' },
                { id: 'decision', label: 'Решение', color: '#8B5CF6' },
                { id: 'closed', label: 'Закрыта', color: '#10B981' },
              ],
            },
            {
              id: 'severity',
              name: 'Серьёзность',
              type: 'select',
              options: [
                { id: 'minor', label: 'Незначительная', color: '#10B981' },
                { id: 'major', label: 'Значительная', color: '#F59E0B' },
                { id: 'critical', label: 'Критическая', color: '#EF4444' },
              ],
            },
            {
              id: 'responsible',
              name: 'Ответственный',
              type: 'user',
            },
          ],
        },
        {
          id: 'client',
          name: 'Данные клиента',
          order: 1,
          fields: [
            {
              id: 'client_name',
              name: 'Имя клиента',
              type: 'text',
              required: true,
            },
            {
              id: 'client_phone',
              name: 'Телефон',
              type: 'text',
            },
            {
              id: 'client_email',
              name: 'Email',
              type: 'text',
            },
          ],
        },
        {
          id: 'relations',
          name: 'Связи',
          order: 2,
          fields: [
            {
              id: 'related_ticket',
              name: 'Связанная заявка ТП',
              type: 'relation',
              relatedWorkspaceId: '', // Will be updated after creation
            },
          ],
        },
      ],
    });

    // Обновляем связь между рабочими местами
    const relationsSection = complaints.sections.find((s) => s.id === 'relations');
    if (relationsSection) {
      const relatedTicketField = relationsSection.fields.find(
        (f) => f.id === 'related_ticket',
      ) as { relatedWorkspaceId?: string } | undefined;
      if (relatedTicketField) {
        relatedTicketField.relatedWorkspaceId = techSupport.id;
        await this.workspaceRepository.save(complaints);
      }
    }

    // Создаём заявки технической поддержки
    await this.entityRepository.save([
      {
        customId: 'TP-1247',
        workspaceId: techSupport.id,
        title: 'Не работает принтер HP LaserJet',
        status: 'new',
        priority: 'high',
        assigneeId: users[0].id,
        data: {
          description: 'Принтер не печатает, мигает красная лампочка',
          department: 'it',
        },
      },
      {
        customId: 'TP-1248',
        workspaceId: techSupport.id,
        title: 'Проблема с доступом к корпоративной почте',
        status: 'new',
        priority: 'medium',
        assigneeId: users[1].id,
        data: {
          description: 'Не могу войти в Outlook, пишет "неверный пароль"',
          department: 'hr',
        },
      },
      {
        customId: 'TP-1245',
        workspaceId: techSupport.id,
        title: 'Настройка нового рабочего места',
        status: 'in-progress',
        priority: 'medium',
        assigneeId: users[2].id,
        data: {
          description: 'Настроить ПК для нового сотрудника отдела маркетинга',
          department: 'marketing',
        },
        linkedEntityIds: ['REK-445'],
      },
      {
        customId: 'TP-1243',
        workspaceId: techSupport.id,
        title: 'Обновление ПО на рабочих станциях',
        status: 'testing',
        priority: 'low',
        assigneeId: users[0].id,
        data: {
          description: 'Массовое обновление Windows и Office',
          department: 'it',
        },
      },
    ]);

    // Создаём рекламации
    await this.entityRepository.save([
      {
        customId: 'REK-445',
        workspaceId: complaints.id,
        title: 'Жалоба на качество обслуживания',
        status: 'investigation',
        priority: 'high',
        assigneeId: users[2].id,
        data: {
          severity: 'major',
          client_name: 'ООО "Альфа"',
          client_phone: '+7 (495) 123-45-67',
          client_email: 'info@alpha.ru',
        },
      },
      {
        customId: 'REK-446',
        workspaceId: complaints.id,
        title: 'Претензия по срокам доставки',
        status: 'received',
        priority: 'medium',
        assigneeId: users[1].id,
        data: {
          severity: 'minor',
          client_name: 'ИП Сидоров',
          client_phone: '+7 (916) 987-65-43',
        },
      },
    ]);

    console.log('✅ Seed data created:');
    console.log('   - 4 users');
    console.log('   - 2 workspaces (Техническая поддержка, Рекламации)');
    console.log('   - 4 tech support tickets');
    console.log('   - 2 complaints');
  }
}
