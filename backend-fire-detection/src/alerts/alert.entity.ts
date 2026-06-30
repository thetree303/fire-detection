import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Camera } from './../cameras/camera.entity';
import { AlertLevel } from './enums/alert-level.enum';

@Entity('fire_alerts')
export class FireAlert {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Camera, (camera) => camera.alerts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'camera_id' })
  camera: Camera;

  @Column({ type: 'enum', enum: AlertLevel, default: AlertLevel.HIGH })
  level: AlertLevel;

  @Column({ type: 'varchar', name: 'image_filename', nullable: true })
  imageFilename: string | null;

  @Column({ type: 'varchar', name: 'video_filename', nullable: true })
  videoFilename: string | null;

  @Column({ name: 'is_resolved', default: false })
  isResolved: boolean;

  @CreateDateColumn({ name: 'detected_at' })
  detectedAt: Date;
}
