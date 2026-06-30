/**
 * Interface client MQTT
 */

export interface MqttClient {
  write(topic: string, message: string): void;
}
