import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Room } from '../rooms/room.entity';
import { FireAlert } from '../alerts/alert.entity';
import { User } from '../users/user.entity';
import { CameraStatus } from './enums/camera-status.enum';

@Entity('cameras')
export class Camera {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'mac_address', unique: true })
  macAddress: string;

  @Column({ name: 'ip_address', nullable: true })
  ipAddress: string;

  @Column()
  name: string;

  @Column({ name: 'stream_url', nullable: true })
  streamUrl: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: CameraStatus.ONLINE })
  status: CameraStatus;

  @ManyToOne(() => Room, (room) => room.cameras, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'room_id' })
  room: Room | null;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @OneToMany(() => FireAlert, (alert) => alert.camera)
  alerts: FireAlert[];

  // === Nguong canh bao ===
  // Logic 3 trang thai:
  //   NULL    = Thiet bi khong ho tro cam bien nay
  //   0/false = Co ho tro, nhung nguoi dung dang TAT canh bao
  //   >0/true = Co ho tro va nguoi dung dang BAT canh bao
  @Column({
    type: 'float',
    name: 'yolo_confidence',
    nullable: true,
    default: null,
  })
  yoloConfidence: number | null;

  @Column({
    type: 'float',
    name: 'max_temperature',
    nullable: true,
    default: null,
  }) // Analog
  maxTemperature: number | null;

  @Column({
    type: 'float',
    name: 'max_gas_percent',
    nullable: true,
    default: null,
  }) // Analog
  maxGasPercent: number | null;

  @Column({
    type: 'boolean',
    name: 'smoke_trigger',
    nullable: true,
    default: null,
  }) // Digital
  smokeTrigger: boolean | null;

  @Column({
    type: 'boolean',
    name: 'flame_trigger',
    nullable: true,
    default: null,
  }) // Digital
  flameTrigger: boolean | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
