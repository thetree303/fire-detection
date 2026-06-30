import { IsNumber, IsIn, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

class FullSensorDataDto {
  @IsNumber()
  @IsOptional()
  @IsIn([0, 1]) // Cụm thiết bị mới sử dụng
  smoke: number;

  @IsNumber()
  @IsOptional()
  @IsIn([0, 1]) // Cụm thiết bị mới sử dụng
  flame: number;

  @IsNumber()
  @IsOptional() // Cụm ESP32_Fire_2 sử dụng
  temperature: number;

  @IsNumber()
  @IsOptional() // Cụm ESP32_Fire_2 sử dụng
  humidity: number;

  @IsNumber()
  @IsOptional() // Cụm ESP32_Fire_2 sử dụng
  gasPercent: number;
}

export class SensorDataDto extends PartialType(FullSensorDataDto) {}
