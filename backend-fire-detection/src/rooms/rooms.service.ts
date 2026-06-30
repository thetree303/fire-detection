import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './room.entity';
import { User } from '../users/user.entity';
import { NotFoundException } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
  ) {}

  async findAll(user: User): Promise<Room[]> {
    return this.roomRepository.find({
      where: { owner: { id: user.id } },
      relations: ['cameras'],
    });
  }

  async findOne(id: number, user: User): Promise<Room> {
    const room = await this.roomRepository.findOne({
      where: { id: id },
      relations: ['owner', 'cameras'],
    });
    if (!room || room.owner.id !== user.id) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }

  async create(data: CreateRoomDto, user: User): Promise<Room> {
    const room = this.roomRepository.create({ ...data, owner: user });
    return this.roomRepository.save(room);
  }

  async update(id: number, data: UpdateRoomDto, user: User): Promise<any> {
    const room = await this.roomRepository.findOne({
      where: { id },
      relations: ['owner'],
    });
    if (!room || room.owner.id !== user.id) {
      throw new NotFoundException('Room not found');
    }

    return await this.roomRepository.update(id, data);
  }

  async delete(id: number, user: User): Promise<any> {
    const room = await this.roomRepository.findOne({
      where: { id },
      relations: ['owner'],
    });
    if (!room || room.owner.id !== user.id) {
      throw new NotFoundException('Room not found');
    }
    return await this.roomRepository.delete(id);
  }
}
