#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <WiFiManager.h>
#include <Preferences.h>

// ============== CẤU HÌNH PINS ===============
#define DHTPIN 4
#define DHTTYPE DHT11
#define MQ2_ANALOG_PIN 34
#define BUZZER_PIN 18
#define RESET_PIN  15     // Reset pin tích cực thấp, nối xuống GND để reset
#define LED_PIN    2
#define ALERT_PIN  13 

// ========== BIẾN LƯU TRỮ CẤU HÌNH ==========
String macAddr;
char mqttTopicSensor[40];
char mqttTopicCommand[40];
char mqttTopicStatus[40];

char cameraStreamUrl[60] = "0";   // Giả lập, không có camera vật lý

// MQTT Server (Domain hoặc IP) và User Token — đọc từ Flash khi khởi động
char mqttServerAddr[64] = "";     // Domain hoặc IP, lưu trong Flash với key "server_ip"
uint16_t mqttServerPort = 1883;   // Hardcode, không cần cấu hình
bool mqttServerFound    = false;  // true khi đã có địa chỉ server hợp lệ


DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient mqttClient(espClient);
Preferences preferences;

unsigned long lastSensorCheck         = 0;
const long    sensorInterval          = 5000;
unsigned long lastMqttReconnectAttempt = 0;

unsigned long lastButtonPress   = 0;
const long    buttonHoldDuration = 5000; // 5 giây để reset
bool          buttonPressed      = false;

unsigned long lastLedBlink = 0;
long          blinkInterval = 1000;
bool          ledState      = true;

// ============== HÀM ĐIỀU KHIỂN ĐÈN STATUS PHI KHÓA =============
void updateStatusLED() {
  unsigned long currentMillis = millis();

  // Chưa kết nối WiFi → nháy nhanh
  if (WiFi.status() != WL_CONNECTED) {
    blinkInterval = 100;
  }
  // Có WiFi nhưng chưa kết nối MQTT → nháy vừa
  else if (!mqttClient.connected()) {
    blinkInterval = 500;
  }
  // Kết nối đầy đủ → nháy chậm
  else {
    blinkInterval = 2000;
  }

  if (currentMillis - lastLedBlink >= blinkInterval) {
    lastLedBlink = currentMillis;
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState ? HIGH : LOW);
  }
}

// ============== HÀM XỬ LÝ NÚT NHẤN RESET =============
void checkResetButton() {
  if (digitalRead(RESET_PIN) == LOW) {
    if (!buttonPressed) {
      buttonPressed = true;
      lastButtonPress = millis();
    } else if (millis() - lastButtonPress > buttonHoldDuration) {
      Serial.println("[RESET] Button held 5s. Clearing all settings and restarting...");

      // Xóa cấu hình WiFi đã lưu (credentials)
      WiFiManager wm;
      wm.resetSettings();

      // Xóa sạch toàn bộ cấu hình Flash: server_ip
      preferences.begin("server-config", false);
      preferences.clear();   
      preferences.end();
      Serial.println("[RESET] Flash cleared (server_ip removed).");

      delay(2000);
      ESP.restart();
    }
  } else {
    buttonPressed = false;
  }
}

// ============== HÀM ĐỌC VÀ GỬI CẢM BIẾN =============
void checkSensors() {
  float humidity    = dht.readHumidity();
  float temperature = dht.readTemperature();

  int gasValue   = analogRead(MQ2_ANALOG_PIN);
  int gasPercent = map(gasValue, 300, 4000, 0, 100);

  // Giới hạn giá trị map trong khoảng 0-100% tránh sai số hardware
  if (gasPercent < 0) gasPercent = 0;
  if (gasPercent > 100) gasPercent = 100;

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println(F("[ERROR] Cannot read data from DHT11"));
    return;
  }

  Serial.printf("Temp: %.1f°C | Hum: %.1f%% | Gas: %d%%\n",
                temperature, humidity, gasPercent);

  if (mqttClient.connected()) {
    char payload[128];
    snprintf(payload, sizeof(payload),
             "{\"temperature\": %.1f, \"humidity\": %.1f, \"gasPercent\": %d}",
             temperature, humidity, gasPercent);
    mqttClient.publish(mqttTopicSensor, payload);
  }
}

// ============== MQTT CALLBACK (ĐỒNG BỘ LOGIC VỚI BACKEND) =============
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("[MQTT] Command on topic [");
  Serial.print(topic);
  Serial.print("]: ");

  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.println(message);

  // Parse lệnh bật/tắt còi và đèn alert từ gói JSON siêu gọn của Backend
  if (message.indexOf("\"buzzer\":1") != -1 || message.indexOf("\"buzzer\": 1") != -1) {
    digitalWrite(BUZZER_PIN, HIGH);
    digitalWrite(ALERT_PIN, HIGH); // Bật cả đèn cảnh báo phụ kèm theo
    Serial.println("[ALARM] FIRE ALARM ACTIVATED!");
  } 
  else if (message.indexOf("\"buzzer\":0") != -1 || message.indexOf("\"buzzer\": 0") != -1) {
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(ALERT_PIN, LOW);  // Tắt cả đèn cảnh báo phụ
    Serial.println("[ALARM] System secured. Turned off.");
  }
}

// ============== HÀM KẾT NỐI LẠI MQTT =============
boolean reconnectMQTT() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MQTT] WiFi not connected. Cannot reconnect.");
    return false;
  }

  if (!mqttServerFound || strlen(mqttServerAddr) == 0) {
    Serial.println("[MQTT] No server address configured.");
    return false;
  }

  String clientId = "ESP32-fire02-" + macAddr;
  Serial.print("[MQTT] Connecting to ");
  Serial.print(mqttServerAddr);
  Serial.print("...");

  if (mqttClient.connect(clientId.c_str(),
                         NULL, NULL,
                         mqttTopicStatus, 0, true, "offline")) {
    Serial.println(" Connected!");

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

IPAddress stringToIP(String ipStr) {
  IPAddress ip;
  if (ip.fromString(ipStr)) {
    return ip;
  }
  return IPAddress(0, 0, 0, 0);
}

// =============== SETUP ===============
void setup() {
  Serial.begin(115200);

  analogSetAttenuation(ADC_11db);

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // Khởi tạo chân đèn ALERT mới thêm vào
  pinMode(ALERT_PIN, OUTPUT);
  digitalWrite(ALERT_PIN, LOW);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  pinMode(RESET_PIN, INPUT_PULLUP);

  dht.begin();

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
  if (!wm.autoConnect("ESP32-FireAlarm-2")) {
    Serial.println("Failed to connect to WiFi. Restarting...");
    delay(3000);
    ESP.restart();
  }
  Serial.println("\n[WiFi] Connected!");

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

  snprintf(mqttTopicSensor,  sizeof(mqttTopicSensor),  "sensors/%s",  macAddr.c_str());
  snprintf(mqttTopicCommand, sizeof(mqttTopicCommand), "commands/%s", macAddr.c_str());
  snprintf(mqttTopicStatus,  sizeof(mqttTopicStatus),  "status/%s",   macAddr.c_str());

  Serial.print("[INFO] Stream URL (simulated): ");
  Serial.println(cameraStreamUrl);
}

// =============== LOOP ===============
void loop() {
  checkResetButton();
  updateStatusLED();

  unsigned long currentMillis = millis();

  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifiReconnect = 0;
    if (currentMillis - lastWifiReconnect > 10000) {
      lastWifiReconnect = currentMillis;
      Serial.println("[WiFi] Lost. Attempting to reconnect...");
      WiFi.reconnect();
    }
    return;
  }

  if (!mqttClient.connected()) {
    static unsigned long lastMqttReconnect = 0;
    if (currentMillis - lastMqttReconnect > 5000) {
      lastMqttReconnect = currentMillis;
      reconnectMQTT();
    }
    mqttClient.loop();
    return;
  }

  mqttClient.loop();

  // Beacon Discovery định kỳ gửi thông tin các cảm biến phần cứng hỗ trợ
  static unsigned long lastDiscovery = 0;
  if (currentMillis - lastDiscovery > 60000) {
    lastDiscovery = currentMillis;
    char payload[250];
    snprintf(payload, sizeof(payload),
      "{\"mac\": \"%s\", \"ip\": \"%s\", \"streamUrl\": \"%s\", \"type\": \"esp32-nocam\", \"sensors\": [\"ai\", \"temperature\", \"humidity\", \"gas\"]}",
      macAddr.c_str(),
      WiFi.localIP().toString().c_str(),
      cameraStreamUrl
    );
    mqttClient.publish("discovery/cameras", payload);
    Serial.println("[Discovery] Beacon sent.");
  }

  if (currentMillis - lastSensorCheck > sensorInterval) {
    lastSensorCheck = currentMillis;
    checkSensors();
  }
}