import { Injectable, Logger } from '@nestjs/common';
import { KeycloakAdminService } from '../modules/auth/keycloak-admin.service';
import { User } from '../modules/user/user.entity';
import { EMPLOYEES } from './data/employees';

/**
 * Регистрация пользователей в Keycloak.
 * Опциональный шаг — если Keycloak не настроен, пропускается.
 */
@Injectable()
export class SeedKeycloakService {
  private readonly logger = new Logger(SeedKeycloakService.name);

  constructor(private readonly keycloakAdmin: KeycloakAdminService) {}

  /**
   * Синхронизировать пользователей с Keycloak:
   * 1. Удалить всех существующих (кроме admin)
   * 2. Создать заново с временными паролями
   */
  async syncUsers(users: User[]): Promise<void> {
    if (!this.keycloakAdmin.isConfigured()) {
      this.logger.warn(
        'Keycloak не настроен, пропускаю регистрацию пользователей',
      );
      return;
    }

    try {
      // Удаляем всех существующих пользователей (кроме admin)
      await this.deleteExistingUsers();

      // Создаём пользователей
      let created = 0;
      let skipped = 0;
      let failed = 0;

      for (const user of users) {
        try {
          const emp = EMPLOYEES.find((e) => e.email === user.email);
          const password =
            this.keycloakAdmin.generateSecurePassword();

          // Атрибуты из данных сотрудника
          const attributes: Record<string, string[]> = {};
          if (user.department) {
            attributes['department'] = [user.department];
          }
          if (emp?.legacyId) {
            attributes['legacyManagerId'] = [String(emp.legacyId)];
          }

          await this.keycloakAdmin.createUser({
            username: user.email,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            enabled: true,
            emailVerified: true,
            attributes,
            credentials: [
              {
                type: 'password',
                value: password,
                temporary: true,
              },
            ],
            requiredActions: ['UPDATE_PASSWORD'],
          });

          this.logger.log(
            `  Keycloak: ${user.email} — пароль: ${password}`,
          );
          created++;
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `  Keycloak: ошибка для ${user.email}: ${msg}`,
          );
          failed++;
        }
      }

      this.logger.log(
        `Keycloak: создано ${created}, пропущено ${skipped}, ошибок ${failed}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Keycloak: критическая ошибка, пропускаю — ${msg}`,
      );
    }
  }

  /**
   * Удалить всех пользователей из Keycloak, кроме admin
   */
  private async deleteExistingUsers(): Promise<void> {
    this.logger.log('Keycloak: удаляем существующих пользователей...');

    let deleted = 0;
    let first = 0;
    const max = 100;
    let hasMore = true;

    while (hasMore) {
      const existingUsers = (await this.keycloakAdmin.getUsers({
        first,
        max,
      })) as Array<{ id: string; username: string }>;

      if (existingUsers.length < max) {
        hasMore = false;
      }

      for (const kcUser of existingUsers) {
        if (kcUser.username === 'admin') {
          continue;
        }

        try {
          await this.keycloakAdmin.deleteUser(kcUser.id);
          deleted++;
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Keycloak: не удалось удалить ${kcUser.username}: ${msg}`,
          );
        }
      }

      first += max;
    }

    if (deleted > 0) {
      this.logger.log(`Keycloak: удалено ${deleted} пользователей`);
    }
  }
}
