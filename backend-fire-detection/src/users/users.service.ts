import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UserStatus } from './enums/user-status.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

const saltOrRounds = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findAll() {
    return this.usersRepository.find();
  }

  async findOne(id: number) {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  // Ham tim user, chi danh cho login (co tra ve passwordHash)
  async findForLogin(identity: string) {
    return this.usersRepository.findOne({
      where: [{ username: identity }, { email: identity }],
      select: ['id', 'username', 'email', 'passwordHash'], // Chi lay cac truong can thiet
    });
  }

  async create(userData: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(
      userData.passwordHash,
      saltOrRounds,
    );
    const user = this.usersRepository.create({
      ...userData,
      passwordHash: hashedPassword,
    });
    return this.usersRepository.save(user);
  }

  async update(id: number, updateData: UpdateUserDto) {
    let user = await this.usersRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (updateData.passwordHash) {
      const newPasswordHash = await bcrypt.hash(
        updateData.passwordHash,
        saltOrRounds,
      );
      updateData.passwordHash = newPasswordHash;
    }
    Object.assign(user, updateData);
    user = await this.usersRepository.save(user);
    return {
      success: true,
      user,
    };
  }

  async softDelete(id: number) {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.usersRepository.update(id, { status: UserStatus.DELETED });
    return this.usersRepository.softDelete(id);
  }

  async updateFcmToken(
    id: number,
    token: string | null,
  ): Promise<{ success: boolean }> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (token) {
      const currentTokens = Array.isArray(user.fcmTokens) ? user.fcmTokens : [];
      const filteredTokens = currentTokens.filter((t) => t !== token);
      filteredTokens.push(token);
      const newTokens = filteredTokens.slice(-10);
      await this.usersRepository.update(id, { fcmTokens: newTokens });
    }
    return { success: true };
  }

  async removeFcmToken(
    id: number,
    tokenToRemove: string,
  ): Promise<{ success: boolean }> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (tokenToRemove) {
      const currentTokens = Array.isArray(user.fcmTokens) ? user.fcmTokens : [];
      const newTokens = currentTokens.filter((t) => t !== tokenToRemove);
      await this.usersRepository.update(id, { fcmTokens: newTokens });
    }
    return { success: true };
  }

  async delete(id: number) {
    await this.usersRepository.delete(id);
    return { deleted: true };
  }
}
