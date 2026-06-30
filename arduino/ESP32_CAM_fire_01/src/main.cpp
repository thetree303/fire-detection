/*
  * File: main.cpp
  * Description: ESP32-CAM Fire Alarm System synced with ESP32-NoCam logic
*/

#include <Arduino.h>
#include "OV2640.h"
#include <WiFi.h>
#include <WebServer.h>
#include <WiFiClient.h>
#include <PubSubClient.h>
#include <esp_camera.h>
#include <WiFiManager.h>
#include <Preferences.h>

#define CAMERA_MODEL_AI_THINKER
#include "camera_pins.h"

// ============== CẤU HÌNH PINS ===============
const int FLAME_PIN  = 2;
const int SMOKE_PIN  = 13;
const int BUZZER_PIN = 14;
const int LED_PIN    = 15;
const int RESET_PIN  = 12; // Cấp chân cho nút Reset (Tích cực thấp, nối xuống GND để reset)

// ========== BIẾN LƯU TRỮ CẤU HÌNH ==========
String macAddr;
char mqttTopicSensor[40];
char mqttTopicCommand[40];
char mqttTopicStatus[40];
char cameraStreamUrl[60];

// MQTT Server (Domain hoặc IP) — đọc từ Flash
char mqttServerAddr[64] = "";     
uint16_t mqttServerPort = 1883;   
bool mqttServerFound    = false;  

OV2640 cam;
WebServer server(80);
WiFiClient espClient;
PubSubClient mqttClient(espClient);
Preferences preferences;

// Variables cho đa nhiệm
unsigned long lastSensorCheck         = 0;
const long    sensorInterval          = 5000;

unsigned long lastButtonPress    = 0;
const long    buttonHoldDuration = 5000; 
bool          buttonPressed      = false;

unsigned long lastLedBlink  = 0;
long          blinkInterval = 1000;
bool          ledState      = true;

// Header Stream MJPEG
const char HEADER[]   = "HTTP/1.1 200 OK\r\n"
                        "Access-Control-Allow-Origin: *\r\n"
                        "Content-Type: multipart/x-mixed-replace; boundary=123456789000000000000987654321\r\n";
const char BOUNDARY[] = "\r\n--123456789000000000000987654321\r\n";
const char CTNTTYPE[] = "Content-Type: image/jpeg\r\nContent-Length: ";
const int hdrLen = strlen(HEADER);
const int bdrLen = strlen(BOUNDARY);
const int cntLen = strlen(CTNTTYPE);


// ============== HÀM ĐIỀU KHIỂN ĐÈN STATUS =============
void updateStatusLED() {
  unsigned long currentMillis = millis();

  // ESP32-CAM LED ở chân 33 thường là Active-Low (Kéo mức LOW đèn sẽ SÁNG)
  if (WiFi.status() != WL_CONNECTED) {
    blinkInterval = 100; // Nháy rất nhanh
  } else if (!mqttClient.connected()) {
    blinkInterval = 500; // Nháy vừa
  } else {
    blinkInterval = 2000; // Nháy chậm
  }

  if (currentMillis - lastLedBlink >= blinkInterval) {
    lastLedBlink = currentMillis;
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState ? HIGH : LOW);
  }
}

// ============== HÀM XỬ LÝ NÚT NHẤN RESET =============
// Giả định nút nhấn nối từ chân RESET_PIN xuống GND (Sử dụng INPUT_PULLUP)
void checkResetButton() {
  if (digitalRead(RESET_PIN) == LOW) { // Nhấn nút (LOW)
    if (!buttonPressed) {
      buttonPressed = true;
      lastButtonPress = millis();
    } else if (millis() - lastButtonPress > buttonHoldDuration) {
      Serial.println("[RESET] Button held 5s. Clearing all settings and restarting...");
      
      WiFiManager wm;
      wm.resetSettings();

      preferences.begin("server-config", false);
      preferences.clear();   
      preferences.end();
      Serial.println("[RESET] Flash cleared (server_ip removed).");

      digitalWrite(LED_PIN, LOW); // Bật sáng LED đỏ báo hiệu đã reset
      delay(2000);
      ESP.restart();
    }
  } else {
    buttonPressed = false;
  }
}

// ============== HÀM ĐỌC VÀ GỬI CẢM BIẾN =============
void checkSensors() {
  // Đọc các cảm biến
  int smokeStatus = !digitalRead(SMOKE_PIN); // Đảo trạng thái vì module MQ thường tích cực mức thấp
  int flameStatus =  digitalRead(FLAME_PIN); // Mạch phát hiện lửa

  Serial.printf("Smoke (Digital): %d | Flame (Digital): %d\n", smokeStatus, flameStatus);

  if (mqttClient.connected()) {
    char payload[100];
    snprintf(payload, sizeof(payload),
             "{\"smoke\": %d, \"flame\": %d}",
             smokeStatus, flameStatus);
    mqttClient.publish(mqttTopicSensor, payload);
  }
}

// ============== MQTT CALLBACK (NHẬN LỆNH CẢNH BÁO) =============
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("[MQTT] Command on topic [");
  Serial.print(topic);
  Serial.print("]: ");

  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  if (message.indexOf("\"buzzer\":1") != -1 || message.indexOf("\"buzzer\": 1") != -1) {
    digitalWrite(BUZZER_PIN, HIGH);
    Serial.println("[ALARM] FIRE ALARM ACTIVATED!");
  } 
  else if (message.indexOf("\"buzzer\":0") != -1 || message.indexOf("\"buzzer\": 0") != -1) {
    digitalWrite(BUZZER_PIN, LOW);
    Serial.println("[ALARM] System secured. Turned off.");
  }
}

// ============== HÀM KẾT NỐI LẠI MQTT =============
boolean reconnectMQTT() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }
  if (!mqttServerFound || strlen(mqttServerAddr) == 0) {
    return false;
  }

  String clientId = "ESP32-CAM-" + macAddr;
  Serial.print("[MQTT] Connecting to ");
  Serial.print(mqttServerAddr);
  Serial.print("...");

  // Thiết lập LWT (Last Will and Testament)
  if (mqttClient.connect(clientId.c_str(), NULL, NULL, mqttTopicStatus, 0, true, "offline")) {
    Serial.println(" Connected!");
    
    // Đăng trạng thái online và theo dõi commands
    mqttClient.publish(mqttTopicStatus, "online", true);
    mqttClient.subscribe(mqttTopicCommand);
    Serial.print("[MQTT] Subscribed to: ");
    Serial.println(mqttTopicCommand);

    return true;
  }

  Serial.print(" Failed, rc=");
  Serial.println(mqttClient.state());
  return false;
}

// Hàm hỗ trợ parser IP
IPAddress stringToIP(String ipStr) {
  IPAddress ip;
  if (ip.fromString(ipStr)) {
    return ip;
  }
  return IPAddress(0, 0, 0, 0);
}

// ============== HÀM BACKGROUND ĐA NHIỆM =============
// Xử lý các task ngầm. Cực kỳ quan trọng khi đang stream video!
void runBackgroundTasks() {
  checkResetButton();
  updateStatusLED();

  unsigned long currentMillis = millis();

  // Kiểm tra WiFi
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifiReconnect = 0;
    if (currentMillis - lastWifiReconnect > 10000) {
      lastWifiReconnect = currentMillis;
      Serial.println("[WiFi] Lost. Attempting to reconnect...");
      WiFi.reconnect();
    }
    return;
  }

  // Kiểm tra MQTT
  if (!mqttClient.connected()) {
    static unsigned long lastMqttReconnect = 0;
    if (currentMillis - lastMqttReconnect > 5000) {
      lastMqttReconnect = currentMillis;
      reconnectMQTT();
    }
  } else {
    mqttClient.loop();
  }

  // Beacon Discovery định kỳ (60s)
  static unsigned long lastDiscovery = 0;
  if (mqttClient.connected() && (currentMillis - lastDiscovery > 60000)) {
    lastDiscovery = currentMillis;
    char payload[250];
    snprintf(payload, sizeof(payload),
      "{\"mac\": \"%s\", \"ip\": \"%s\", \"streamUrl\": \"%s\", \"type\": \"esp32-cam\", \"sensors\": [\"ai\", \"smoke\", \"flame\"]}",
      macAddr.c_str(),
      WiFi.localIP().toString().c_str(),
      cameraStreamUrl
    );
    mqttClient.publish("discovery/cameras", payload);
    Serial.println("[Discovery] Beacon sent.");
  }

  // Đọc và gửi cảm biến (5s/lần)
  if (currentMillis - lastSensorCheck >= sensorInterval) {
    lastSensorCheck = currentMillis;
    checkSensors();
  }
}

// =============== HÀM HTTP CAMERA STREAM ==============
void handle_jpg_stream(void) {
  char buf[32];
  int s;
  WiFiClient client = server.client();

  client.write(HEADER, hdrLen);
  client.write(BOUNDARY, bdrLen);

  while (true) {
    if (!client.connected()) break;
    cam.run();
    s = cam.getSize();
    client.write(CTNTTYPE, cntLen);
    sprintf(buf, "%d\r\n\r\n", s);
    client.write(buf, strlen(buf));
    client.write((char*)cam.getfb(), s);
    client.write(BOUNDARY, bdrLen);

    // Chạy các task ngầm liên tục để đảm bảo hệ thống không bị "đơ" khi stream!
    runBackgroundTasks();
    yield();
  }
}

void handle_jpg(void) {
  WiFiClient client = server.client();
  cam.run();
  if (!client.connected()) return;
  const char JHEADER[] = "HTTP/1.1 200 OK\r\n"
                         "Content-disposition: inline; filename=capture.jpg\r\n"
                         "Content-type: image/jpeg\r\n\r\n";
  client.write(JHEADER, strlen(JHEADER));
  client.write((char*)cam.getfb(), cam.getSize());
}

// =============== SETUP ===============
void setup() {
  Serial.begin(115200);

  // Cấu hình IO
  pinMode(LED_PIN,    OUTPUT);
  digitalWrite(LED_PIN, HIGH); // Tắt LED (vì LED 33 kích mức thấp)
  
  pinMode(SMOKE_PIN,  INPUT);
  pinMode(FLAME_PIN,  INPUT);
  
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  
  pinMode(RESET_PIN, INPUT_PULLUP);

  // === Khởi tạo Camera ===
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0  = Y2_GPIO_NUM;
  config.pin_d1  = Y3_GPIO_NUM;
  config.pin_d2  = Y4_GPIO_NUM;
  config.pin_d3  = Y5_GPIO_NUM;
  config.pin_d4  = Y6_GPIO_NUM;
  config.pin_d5  = Y7_GPIO_NUM;
  config.pin_d6  = Y8_GPIO_NUM;
  config.pin_d7  = Y9_GPIO_NUM;
  config.pin_xclk    = XCLK_GPIO_NUM;
  config.pin_pclk    = PCLK_GPIO_NUM;
  config.pin_vsync   = VSYNC_GPIO_NUM;
  config.pin_href    = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn    = PWDN_GPIO_NUM;
  config.pin_reset   = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size   = FRAMESIZE_QVGA;
  config.jpeg_quality = 12;
  config.fb_count     = 2;
  cam.init(config);

  // === WiFiManager ===
  WiFi.mode(WIFI_STA);
  WiFiManager wm;
  
  macAddr = WiFi.macAddress();
  macAddr.replace(":", "");
  Serial.print("[INFO] Device MAC: ");
  Serial.println(macAddr);

  WiFiManagerParameter custom_server(
    "server",              
    "MQTT Server IP/Domain",  
    "",                    
    40                     
  );
  wm.addParameter(&custom_server);

  Serial.println("Connecting to WiFi...");
  if (!wm.autoConnect("ESP32-CAM-FireAlarm")) {
    Serial.println("Failed to connect to WiFi. Restarting...");
    delay(3000);
    ESP.restart();
  }
  Serial.println("\n[WiFi] Connected!");

  // === Xử lý cấu hình MQTT Server qua Flash ===
  const char* inputServer = custom_server.getValue();

  if (strlen(inputServer) > 0) {
    strncpy(mqttServerAddr, inputServer, sizeof(mqttServerAddr) - 1);
    preferences.begin("server-config", false);
    preferences.putString("server_ip", mqttServerAddr);
    preferences.end();
    Serial.println("[Flash] server_ip saved.");
  } else {
    preferences.begin("server-config", true);
    String savedIP = preferences.getString("server_ip", "");
    preferences.end();
    if (savedIP.length() > 0) {
      strncpy(mqttServerAddr, savedIP.c_str(), sizeof(mqttServerAddr) - 1);
      Serial.print("[Flash] Loaded server: ");
      Serial.println(mqttServerAddr);
    }
  }

  // === Setup MQTT Client ===
  if (strlen(mqttServerAddr) > 0) {
    mqttServerFound = true;
    IPAddress serverIP = stringToIP(String(mqttServerAddr));
    
    if (serverIP != IPAddress(0, 0, 0, 0)) {
        mqttClient.setServer(serverIP, mqttServerPort);
    } else {
        mqttClient.setServer(mqttServerAddr, mqttServerPort);
    }
    mqttClient.setCallback(mqttCallback);
  }

  // Khởi tạo các string topic
  snprintf(mqttTopicSensor,  sizeof(mqttTopicSensor),  "sensors/%s",  macAddr.c_str());
  snprintf(mqttTopicCommand, sizeof(mqttTopicCommand), "commands/%s", macAddr.c_str());
  snprintf(mqttTopicStatus,  sizeof(mqttTopicStatus),  "status/%s",   macAddr.c_str());

  // === Tạo URL stream ===
  snprintf(cameraStreamUrl, sizeof(cameraStreamUrl), "http://%s/mjpeg/1", WiFi.localIP().toString().c_str());
  Serial.print("[INFO] Video streaming link: ");
  Serial.println(cameraStreamUrl);

  // === Web Server ===
  server.on("/mjpeg/1", HTTP_GET, handle_jpg_stream);
  server.on("/jpg",     HTTP_GET, handle_jpg);
  server.onNotFound([]() {
    server.send(404, "text/plain", "Not Found");
  });
  server.begin();

  sensor_t* s = esp_camera_sensor_get();
  if (s != NULL) {
    s->set_brightness(s, -3);
    s->set_contrast(s, 3);
    s->set_ae_level(s, 0);
    s->set_exposure_ctrl(s, 0);
    s->set_aec_value(s, 200); 
    s->set_saturation(s, 0);
  }
}

// =============== LOOP ===============
void loop() {
  runBackgroundTasks();
  server.handleClient();
}