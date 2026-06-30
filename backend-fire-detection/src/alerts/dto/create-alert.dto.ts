import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { AlertLevel } from '../enums/alert-level.enum';

export class CreateAlertDto {
  @IsNotEmpty()
  @IsNumber()
  cameraId: number;

  @IsEnum(AlertLevel)
  @IsNotEmpty()
  level: AlertLevel;

  @IsOptional()
  @IsString()
  imageFilename: string;

  @IsOptional()
  @IsString()
  videoFilename: string;

  @IsNotEmpty()
  @IsString()
  detectedAt: string;
}
