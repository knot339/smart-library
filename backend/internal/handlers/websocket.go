package handlers

import (
	"encoding/json"
	"log"
	"os"
	"sync"
	"time"

	"smart-library-api/internal/hardware"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

type WSMessage struct {
	Type  string `json:"type"`  // ประเภทของอุปกรณ์ ("barcode" หรือ "rfid", "led", "motor")
	Value string `json:"value"` // ข้อมูลที่อ่านได้จากอุปกรณ์ หรือสถานะ
	// เฉพาะคำสั่ง motor "dump" เท่านั้น — ระยะเวลา (ms) ที่ ESP32 ต้องพักเช็คเซนเซอร์ตู้เต็มหลังเทหนังสือ
	// เสร็จ ส่งมาพร้อมคำสั่งทุกครั้งแทนที่จะ hardcode ไว้ในเฟิร์มแวร์ ตั้งค่าได้จากหน้า Dashboard
	SettleMs int `json:"settle_ms,omitempty"`
}

// ตัวแปรสำหรับจัดเก็บรายชื่ออุปกรณ์แท็บเล็ตที่เชื่อมต่ออยู่
var (
	tabletClients = make(map[*websocket.Conn]bool)
	clientMu      sync.Mutex
	MQTTClient    mqtt.Client
)

// ฟังก์ชันเริ่มการเชื่อมต่อ MQTT
func InitMQTT() {
	opts := mqtt.NewClientOptions()
	opts.AddBroker("tcp://smart-library-mqtt:1883")
	opts.SetClientID("smart-library-backend")

	// สำหรับรันนอก Docker เพื่อทดสอบ ถ้าไม่เจอ smart-library-mqtt ให้ใช้ localhost
	if os.Getenv("APP_MODE") != "simulation" {
		opts.AddBroker("tcp://localhost:1883")
	}

	opts.OnConnect = func(c mqtt.Client) {
		log.Println("✅ Connected to MQTT Broker")

		// Subscribe to receive RFID and Barcode from ESP32
		c.Subscribe("smartlibrary/esp32/rfid", 0, func(client mqtt.Client, msg mqtt.Message) {
			log.Printf("📡 Received from ESP32: %s", msg.Payload())

			// Forward to all connected tablets via WebSocket
			clientMu.Lock()
			defer clientMu.Unlock()
			for wsClient := range tabletClients {
				if err := wsClient.WriteMessage(1, msg.Payload()); err != nil {
					wsClient.Close()
					delete(tabletClients, wsClient)
				}
			}
		})

		// Subscribe to receive cabinet full/empty status from ESP32 (Ultrasonic sensor)
		c.Subscribe("smartlibrary/esp32/full", 0, func(client mqtt.Client, msg mqtt.Message) {
			var m WSMessage
			if err := json.Unmarshal(msg.Payload(), &m); err != nil || m.Type != "full" {
				return
			}
			isFull := m.Value == "true"
			log.Printf("📡 Cabinet full status from ESP32: %v", isFull)
			hardware.Shared.SetFull(isFull)
		})

		// Subscribe to ESP32's online/offline presence (publish ตอนต่อสำเร็จ + Last Will ตอนหลุด/ดับ)
		// ใช้บอกฝั่งหน้าเว็บว่าฮาร์ดแวร์จริงต่ออยู่ไหม ไม่ใช่แค่ backend คุย broker ได้
		c.Subscribe("smartlibrary/esp32/status", 0, func(client mqtt.Client, msg mqtt.Message) {
			connected := string(msg.Payload()) == "online"
			log.Printf("📡 ESP32 status: %s", msg.Payload())
			hardware.Shared.SetESP32Connected(connected)
		})
	}
	opts.OnConnectionLost = func(c mqtt.Client, err error) {
		log.Printf("❌ MQTT Connection Lost: %v", err)
	}

	MQTTClient = mqtt.NewClient(opts)
	if token := MQTTClient.Connect(); token.Wait() && token.Error() != nil {
		log.Printf("Failed to connect to MQTT: %v", token.Error())
	}
}

// ฟังก์ชันจัดการการเชื่อมต่อผ่าน WebSocket สำหรับอุปกรณ์แท็บเล็ต
func TabletWS(c *websocket.Conn) {
	clientMu.Lock()
	tabletClients[c] = true
	clientMu.Unlock()

	log.Println("Tablet connected")

	defer func() {
		clientMu.Lock()
		delete(tabletClients, c)
		clientMu.Unlock()
		c.Close()
		log.Println("Tablet disconnected")
	}()

	// รอรับข้อความเพื่อรักษาสถานะการเชื่อมต่อ (Keep-Alive)
	for {
		if _, _, err := c.ReadMessage(); err != nil {
			break
		}
	}
}

func SimulatorSend(c *fiber.Ctx) error {
	var msg WSMessage
	if err := c.BodyParser(&msg); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	payload, _ := json.Marshal(msg)

	// อัปเดตสถานะมอเตอร์ใน hardware.Shared ด้วย (เดิมปุ่มนี้ส่ง MQTT ไปหา ESP32 ตรงๆ อย่างเดียว
	// ไม่เคยอัปเดต state ฝั่ง backend เลย ทำให้ /api/status และหน้า dashboard/tablet
	// ที่อ่านสถานะมอเตอร์จาก backend ไม่เห็นการเปลี่ยนแปลงจากปุ่มในหน้า Simulator)
	if msg.Type == "motor" {
		switch msg.Value {
		case "open":
			hardware.Shared.SetOpen()
		case "close":
			hardware.Shared.SetClosed()
		case "dump":
			hardware.Shared.SetDump()
		}
	}

	// ส่งสัญญาณไปยังอุปกรณ์แท็บเล็ต (ข้อมูลจาก Barcode หรือ RFID)
	if msg.Type == "barcode" || msg.Type == "rfid" {
		clientMu.Lock()
		for client := range tabletClients {
			if err := client.WriteMessage(1, payload); err != nil {
				client.Close()
				delete(tabletClients, client)
			}
		}
		clientMu.Unlock()
	}

	// ส่งคำสั่งไปยังอุปกรณ์ ESP32 ผ่าน MQTT
	// เดิมส่งแค่ led กับ motor ตอนนี้ให้ส่ง barcode และ rfid ไปด้วย
	if msg.Type == "led" || msg.Type == "motor" || msg.Type == "barcode" || msg.Type == "rfid" {
		if MQTTClient != nil && MQTTClient.IsConnected() {
			token := MQTTClient.Publish("smartlibrary/esp32/control", 0, false, payload)
			token.WaitTimeout(2 * time.Second)
		} else {
			log.Println("MQTT Client is not connected")
		}
	}

	return c.JSON(fiber.Map{
		"message": "ส่งสัญญาณสำเร็จ",
		"clients": len(tabletClients),
	})
}
