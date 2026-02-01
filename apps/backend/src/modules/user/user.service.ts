import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.find({ order: { lastName: 'ASC', firstName: 'ASC' } });
  }

  async findOne(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async create(userData: Partial<User>): Promise<User> {
    // Проверка уникальности email
    if (userData.email) {
      const existing = await this.findByEmail(userData.email);
      if (existing) {
        throw new ConflictException('Пользователь с таким email уже существует');
      }
    }

    if (userData.password) {
      userData.password = await bcrypt.hash(userData.password, 10);
    }
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  async update(id: string, userData: Partial<User>): Promise<User> {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Проверка уникальности email при изменении
    if (userData.email && userData.email !== user.email) {
      const existing = await this.findByEmail(userData.email);
      if (existing) {
        throw new ConflictException('Пользователь с таким email уже существует');
      }
    }

    // Хеширование пароля если он изменяется
    if (userData.password) {
      userData.password = await bcrypt.hash(userData.password, 10);
    }

    Object.assign(user, userData);
    return this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    await this.userRepository.remove(user);
  }
}
