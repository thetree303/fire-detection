import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsNumber,
  MaxLength,
  IsEnum,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { CameraStatus } from '../enums/camera-status.enum';

export class CreateCameraDto {
  /** Địa chỉ MAC của thiết bị (có hoặc không có dấu ':', VD: AA:BB:CC:DD:EE:FF hoặc AABBCCDDEEFF) */
  @IsString()
  @IsNotEmpty()
  @MaxLength(17)
  macAddress: string;

  // Tên camera
  @IsString()
  @IsNotEmpty()
  name: string;

  // Mô tả camera
  @IsString()
  @IsOptional()
  description?: string;

  // ID phòng của camera
  @IsNumber()
  @IsOptional()
  roomId?: number;

  // Stream URL của camera
  @IsString()
  @IsOptional()
  streamUrl?: string;

  // Status của camera
  @IsEnum(CameraStatus)
  @IsOptional()
  status?: CameraStatus;

  // Ngưỡng cảnh báo AI
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  yoloConfidence?: number;

  // Ngưỡng cảnh báo nhiệt độ
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxTemperature?: number;

  // Ngưỡng cảnh báo khí ga
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  maxGasPercent?: number;

  // Ngưỡng cảnh báo khói (Digital)
  @IsBoolean()
  @IsOptional()
  smokeTrigger?: boolean;

  // Ngưỡng cảnh báo lửa (Digital)
  @IsBoolean()
  @IsOptional()
  flameTrigger?: boolean;

  // Số cảm biến vượt ngưỡng tối thiểu để kích hoạt cảnh báo
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  minTriggers?: number;
}
