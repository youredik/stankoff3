import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

/**
 * Данные для создания пользователя в Keycloak
 */
export interface KeycloakUserCreate {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
  credentials?: Array<{
    type: string;
    value: string;
    temporary: boolean;
  }>;
  requiredActions?: string[];
}

/**
 * Результат импорта пользователя
 */
export interface UserImportResult {
  success: boolean;
  username: string;
  email: string;
  keycloakId?: string;
  temporaryPassword?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Сводка импорта
 */
export interface ImportSummary {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  results: UserImportResult[];
}

/**
 * Сервис для административных операций с Keycloak
 * Использует Admin REST API для управления пользователями
 *
 * Требует:
 * - KEYCLOAK_ADMIN_CLIENT_ID - client с правами admin
 * - KEYCLOAK_ADMIN_CLIENT_SECRET - секрет клиента
 *
 * Или:
 * - KEYCLOAK_ADMIN_USERNAME / KEYCLOAK_ADMIN_PASSWORD - учётные данные админа
 */
@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private adminClient: AxiosInstance | null = null;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(private configService: ConfigService) {}

  /**
   * Проверка, настроен ли Admin API
   */
  isConfigured(): boolean {
    const url = this.configService.get<string>('KEYCLOAK_URL');
    const realm = this.configService.get<string>('KEYCLOAK_REALM');

    // Нужны либо client credentials, либо admin credentials
    const hasClientCredentials =
      this.configService.get<string>('KEYCLOAK_ADMIN_CLIENT_ID') &&
      this.configService.get<string>('KEYCLOAK_ADMIN_CLIENT_SECRET');

    const hasAdminCredentials =
      this.configService.get<string>('KEYCLOAK_ADMIN_USERNAME') &&
      this.configService.get<string>('KEYCLOAK_ADMIN_PASSWORD');

    return !!(url && realm && (hasClientCredentials || hasAdminCredentials));
  }

  /**
   * Получение access token для Admin API
   */
  private async getAdminToken(): Promise<string> {
    // Проверяем, не истёк ли токен (с запасом 60 секунд)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    const keycloakUrl = this.configService.get<string>('KEYCLOAK_URL');
    const realm = this.configService.get<string>('KEYCLOAK_REALM');

    // Пробуем client credentials
    const adminClientId = this.configService.get<string>('KEYCLOAK_ADMIN_CLIENT_ID');
    const adminClientSecret = this.configService.get<string>('KEYCLOAK_ADMIN_CLIENT_SECRET');

    if (adminClientId && adminClientSecret) {
      const tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;

      const response = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: adminClientId,
          client_secret: adminClientSecret,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = Date.now() + response.data.expires_in * 1000;
      return this.accessToken!;
    }

    // Пробуем password grant с admin credentials
    const adminUsername = this.configService.get<string>('KEYCLOAK_ADMIN_USERNAME');
    const adminPassword = this.configService.get<string>('KEYCLOAK_ADMIN_PASSWORD');
    const clientId = this.configService.get<string>('KEYCLOAK_CLIENT_ID');

    if (adminUsername && adminPassword) {
      // Для password grant используем master realm
      const tokenUrl = `${keycloakUrl}/realms/master/protocol/openid-connect/token`;

      const response = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'password',
          client_id: 'admin-cli',
          username: adminUsername,
          password: adminPassword,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = Date.now() + response.data.expires_in * 1000;
      return this.accessToken!;
    }

    throw new Error(
      'Keycloak Admin API не настроен. Укажите KEYCLOAK_ADMIN_CLIENT_ID/SECRET или KEYCLOAK_ADMIN_USERNAME/PASSWORD',
    );
  }

  /**
   * Создание HTTP клиента для Admin API
   */
  private async getAdminClient(): Promise<AxiosInstance> {
    const token = await this.getAdminToken();
    const keycloakUrl = this.configService.get<string>('KEYCLOAK_URL');
    const realm = this.configService.get<string>('KEYCLOAK_REALM');

    return axios.create({
      baseURL: `${keycloakUrl}/admin/realms/${realm}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Генерация безопасного пароля
   * Включает: заглавные, строчные, цифры, спецсимволы
   * Минимум 16 символов
   */
  generateSecurePassword(length: number = 16): string {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // без I, O (путаются с 1, 0)
    const lowercase = 'abcdefghjkmnpqrstuvwxyz'; // без i, l, o
    const numbers = '23456789'; // без 0, 1
    const special = '!@#$%^&*';

    const allChars = uppercase + lowercase + numbers + special;

    // Гарантируем минимум по одному символу каждого типа
    let password = '';
    password += uppercase[crypto.randomInt(uppercase.length)];
    password += lowercase[crypto.randomInt(lowercase.length)];
    password += numbers[crypto.randomInt(numbers.length)];
    password += special[crypto.randomInt(special.length)];

    // Добавляем остальные символы
    for (let i = password.length; i < length; i++) {
      password += allChars[crypto.randomInt(allChars.length)];
    }

    // Перемешиваем
    return password
      .split('')
      .sort(() => crypto.randomInt(3) - 1)
      .join('');
  }

  /**
   * Проверка существования пользователя по email
   */
  async userExistsByEmail(email: string): Promise<{ exists: boolean; userId?: string }> {
    try {
      const client = await this.getAdminClient();
      const response = await client.get('/users', {
        params: { email, exact: true },
      });

      if (response.data && response.data.length > 0) {
        return { exists: true, userId: response.data[0].id };
      }
      return { exists: false };
    } catch (error) {
      this.logger.error(`Ошибка проверки пользователя: ${error}`);
      throw error;
    }
  }

  /**
   * Создание пользователя в Keycloak
   */
  async createUser(userData: KeycloakUserCreate): Promise<{ userId: string }> {
    const client = await this.getAdminClient();

    const response = await client.post('/users', {
      username: userData.username,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      enabled: userData.enabled ?? true,
      emailVerified: userData.emailVerified ?? true, // Доверяем email из legacy
      attributes: userData.attributes,
      credentials: userData.credentials,
      requiredActions: userData.requiredActions ?? ['UPDATE_PASSWORD'],
    });

    // Keycloak возвращает Location header с ID нового пользователя
    const locationHeader = response.headers['location'] || response.headers['Location'];
    if (locationHeader) {
      const userId = locationHeader.split('/').pop();
      return { userId };
    }

    // Если нет header, ищем по email
    const { userId } = await this.userExistsByEmail(userData.email);
    if (userId) {
      return { userId };
    }

    throw new Error('Не удалось получить ID созданного пользователя');
  }

  /**
   * Установка пароля для пользователя
   */
  async setUserPassword(userId: string, password: string, temporary: boolean = true): Promise<void> {
    const client = await this.getAdminClient();

    await client.put(`/users/${userId}/reset-password`, {
      type: 'password',
      value: password,
      temporary,
    });
  }

  /**
   * Получение списка всех пользователей
   */
  async getUsers(params?: { first?: number; max?: number; search?: string }): Promise<unknown[]> {
    const client = await this.getAdminClient();
    const response = await client.get('/users', { params });
    return response.data;
  }

  /**
   * Удаление пользователя
   */
  async deleteUser(userId: string): Promise<void> {
    const client = await this.getAdminClient();
    await client.delete(`/users/${userId}`);
  }

  /**
   * Сброс паролей для пользователей с корпоративными email
   * Пропускает пользователей с username 'admin'
   */
  async resetPasswordsForLegacyUsers(options: {
    dryRun?: boolean;
    passwordLength?: number;
    emailDomain?: string;
  } = {}): Promise<ImportSummary> {
    const { dryRun = false, passwordLength = 16, emailDomain } = options;
    const results: UserImportResult[] = [];
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    this.logger.log(`Сброс паролей для пользователей (dryRun: ${dryRun})`);

    const client = await this.getAdminClient();

    // Получаем всех пользователей (с пагинацией)
    let first = 0;
    const max = 100;
    let hasMore = true;

    while (hasMore) {
      const response = await client.get('/users', { params: { first, max } });
      const users = response.data as Array<{
        id: string;
        username: string;
        email?: string;
        firstName?: string;
        lastName?: string;
      }>;

      if (users.length < max) {
        hasMore = false;
      }

      for (const user of users) {
        // Пропускаем admin пользователя
        if (user.username === 'admin') {
          skipped++;
          continue;
        }

        // Если указан домен - фильтруем по нему
        if (emailDomain && user.email && !user.email.endsWith(emailDomain)) {
          skipped++;
          continue;
        }

        const temporaryPassword = this.generateSecurePassword(passwordLength);

        try {
          if (!dryRun) {
            await this.setUserPassword(user.id, temporaryPassword, true);
          }

          results.push({
            success: true,
            username: user.username,
            email: user.email || user.username,
            keycloakId: user.id,
            temporaryPassword,
          });
          updated++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({
            success: false,
            username: user.username,
            email: user.email || user.username,
            keycloakId: user.id,
            error: errorMessage,
          });
          failed++;
        }
      }

      first += max;
    }

    this.logger.log(`Сброс паролей завершён: ${updated} обновлено, ${skipped} пропущено, ${failed} ошибок`);

    return {
      total: updated + skipped + failed,
      created: updated,
      skipped,
      failed,
      results,
    };
  }

  /**
   * Массовый импорт сотрудников из legacy системы
   *
   * @param employees Массив сотрудников из legacy
   * @param options Опции импорта
   * @returns Сводка импорта с паролями
   */
  async importLegacyEmployees(
    employees: Array<{
      id: number;
      userId: number;
      alias: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      departmentId: number | null;
      departmentName: string | null;
      isActive: boolean;
      canAcceptRequests: boolean;
      canSale: boolean;
      telegramId: string | null;
    }>,
    options: {
      skipExisting?: boolean;
      dryRun?: boolean;
      passwordLength?: number;
    } = {},
  ): Promise<ImportSummary> {
    const { skipExisting = true, dryRun = false, passwordLength = 16 } = options;

    const results: UserImportResult[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    this.logger.log(`Начинаю импорт ${employees.length} сотрудников (dryRun: ${dryRun})`);

    for (const employee of employees) {
      // Пропускаем сотрудников без email
      if (!employee.email) {
        results.push({
          success: false,
          username: employee.alias || `user_${employee.id}`,
          email: '',
          skipped: true,
          skipReason: 'Нет email',
        });
        skipped++;
        continue;
      }

      const username = employee.email.toLowerCase(); // email как username
      const email = employee.email.toLowerCase();

      try {
        // Проверяем существование
        if (skipExisting) {
          const { exists, userId: existingId } = await this.userExistsByEmail(email);
          if (exists) {
            results.push({
              success: false,
              username,
              email,
              keycloakId: existingId,
              skipped: true,
              skipReason: 'Пользователь уже существует',
            });
            skipped++;
            continue;
          }
        }

        // Генерируем пароль
        const temporaryPassword = this.generateSecurePassword(passwordLength);

        // Формируем атрибуты из legacy данных
        const attributes: Record<string, string[]> = {};
        if (employee.alias) attributes['alias'] = [employee.alias];
        if (employee.departmentName) attributes['department'] = [employee.departmentName];
        if (employee.departmentId) attributes['departmentId'] = [String(employee.departmentId)];
        if (employee.telegramId && employee.telegramId !== '0') {
          attributes['telegramId'] = [employee.telegramId];
        }
        if (employee.phone && employee.phone !== '0') attributes['phone'] = [employee.phone];
        attributes['legacyManagerId'] = [String(employee.id)];
        attributes['legacyCustomerId'] = [String(employee.userId)];
        attributes['canAcceptRequests'] = [String(employee.canAcceptRequests)];
        attributes['canSale'] = [String(employee.canSale)];

        if (dryRun) {
          results.push({
            success: true,
            username,
            email,
            temporaryPassword,
          });
          created++;
          continue;
        }

        // Создаём пользователя
        const { userId } = await this.createUser({
          username,
          email,
          firstName: employee.firstName || undefined,
          lastName: employee.lastName || undefined,
          enabled: true,
          emailVerified: true,
          attributes,
          requiredActions: ['UPDATE_PASSWORD'], // Обязательная смена пароля
        });

        // Устанавливаем временный пароль
        await this.setUserPassword(userId, temporaryPassword, true);

        results.push({
          success: true,
          username,
          email,
          keycloakId: userId,
          temporaryPassword,
        });
        created++;

        this.logger.debug(`Создан пользователь: ${email} (${userId})`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Проверяем, не конфликт ли (409)
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          results.push({
            success: false,
            username,
            email,
            skipped: true,
            skipReason: 'Конфликт: пользователь уже существует',
          });
          skipped++;
        } else {
          results.push({
            success: false,
            username,
            email,
            error: errorMessage,
          });
          failed++;
          this.logger.error(`Ошибка импорта ${email}: ${errorMessage}`);
        }
      }
    }

    const summary: ImportSummary = {
      total: employees.length,
      created,
      skipped,
      failed,
      results,
    };

    this.logger.log(
      `Импорт завершён: ${created} создано, ${skipped} пропущено, ${failed} ошибок`,
    );

    return summary;
  }
}
