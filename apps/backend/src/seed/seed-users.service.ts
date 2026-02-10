import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../modules/user/user.entity';
import { EMPLOYEES, SeedEmployee } from './data/employees';
import { DEPARTMENTS } from './data/departments';

/**
 * Создание 87 пользователей из hardcoded данных сотрудников.
 * Пароль для всех: 'password' (dev mode auth).
 */
@Injectable()
export class SeedUsersService {
  private readonly logger = new Logger(SeedUsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Создать всех сотрудников. Хэширует пароль один раз,
   * создаёт User[] и сохраняет batch-ом.
   */
  async createAll(): Promise<User[]> {
    const passwordHash = await bcrypt.hash('password', 10);

    const usersToCreate = EMPLOYEES.map((emp) => {
      const department = this.getDepartmentName(emp.departmentKey);

      return this.userRepo.create({
        email: emp.email,
        firstName: emp.firstName,
        lastName: emp.lastName,
        password: passwordHash,
        role: emp.role,
        department,
        isActive: true,
      });
    });

    const savedUsers = await this.userRepo.save(usersToCreate);

    this.logger.log(`Создано ${savedUsers.length} пользователей`);
    return savedUsers;
  }

  /**
   * Найти пользователя по email
   */
  findByEmail(users: User[], email: string): User | undefined {
    return users.find((u) => u.email === email);
  }

  /**
   * Найти всех пользователей из конкретного отдела (по departmentKey из EMPLOYEES)
   */
  findByDepartment(users: User[], departmentKey: string): User[] {
    return users.filter((u) => {
      const emp = EMPLOYEES.find((e) => e.email === u.email);
      return emp?.departmentKey === departmentKey;
    });
  }

  /**
   * Получить русское название отдела по ключу
   */
  private getDepartmentName(departmentKey: string): string {
    const dept = DEPARTMENTS.find((d) => d.key === departmentKey);
    return dept?.name ?? departmentKey;
  }
}
