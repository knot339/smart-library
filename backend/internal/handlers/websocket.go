package handlers

import (
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"smart-library-api/internal/database"
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

// ตัวแปรสำหรับจัดเก็บรายชื่ออุปกรณ์แท็บเล็ตที่เชื่อมต่ออยู่ — ค่า (string) คือ cabinet_id ของตู้ที่
// แท็บเล็ตเครื่องนั้นผูกไว้ (ส่งมาตอนต่อ WebSocket ด้วย query param ?cabinet=) ใช้กรองว่าข้อความ
// RFID/barcode จากตู้ไหนควรส่งไปหาแท็บเล็ตเครื่องไหน ไม่ broadcast ไปทุกเครื่องเหมือนเดิม
// (ตอนยังมีตู้เดียว broadcast ไปทุกเครื่องไม่มีปัญหา แต่พอมีหลายตู้ แท็บเล็ตตู้ A จะเห็นสัญญาณสแกนของ
// ตู้ B ไปด้วยถ้าไม่กรอง)
var (
	tabletClients = make(map[*websocket.Conn]string)
	clientMu      sync.Mutex
	MQTTClient    mqtt.Client
)

// แยก cabinet_id ออกจาก topic ที่มีรูปแบบ "smartlibrary/<cabinet_id>/<suffix>" — เฟิร์มแวร์ ESP32
// ตัวที่ยังไม่อัปเดตมาใช้ WiFiManager (ก่อนเฟส 2) ยัง hardcode publish เป็น "smartlibrary/esp32/..."
// อยู่ ("esp32" ไม่ใช่ cabinet_id จริง) จึง normalize ค่านี้ให้กลายเป็นตู้เริ่มต้นแทน กัน state ไปตกอยู่
// คนละที่กับที่ /api/status และ Dashboard เดิมอ่าน (hardware.DefaultCabinetID) — ลบทิ้งได้ตอนเฟิร์มแวร์
// ทุกตัวอัปเดตให้ publish ด้วย cabinet_id จริงแล้ว (เฟส 2)
func cabinetIDFromTopic(topic string) string {
	parts := strings.Split(topic, "/")
	if len(parts) < 2 {
		return ""
	}
	if parts[1] == "esp32" {
		return hardware.DefaultCabinetID
	}
	return parts[1]
}

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

		// Subscribe แบบ wildcard (+ = 1 ระดับ) แทน topic ตายตัว เพื่อรองรับหลายตู้พร้อมกัน — แยกว่า
		// ข้อความมาจากตู้ไหนจากชื่อ topic เอง (smartlibrary/<cabinet_id>/...)
		c.Subscribe("smartlibrary/+/rfid", 0, func(client mqtt.Client, msg mqtt.Message) {
			cabinetID := cabinetIDFromTopic(msg.Topic())
			log.Printf("📡 Received from ESP32 [%s]: %s", cabinetID, msg.Payload())

			// ส่งต่อเฉพาะแท็บเล็ตที่ผูกไว้กับตู้เดียวกันเท่านั้น ไม่ broadcast ไปทุกเครื่อง
			clientMu.Lock()
			defer clientMu.Unlock()
			for wsClient, wsCabinetID := range tabletClients {
				if wsCabinetID != cabinetID {
					continue
				}
				if err := wsClient.WriteMessage(1, msg.Payload()); err != nil {
					wsClient.Close()
					delete(tabletClients, wsClient)
				}
			}
		})

		// Subscribe to receive cabinet full/empty status from ESP32 (Ultrasonic sensor)
		c.Subscribe("smartlibrary/+/full", 0, func(client mqtt.Client, msg mqtt.Message) {
			cabinetID := cabinetIDFromTopic(msg.Topic())
			var m WSMessage
			if err := json.Unmarshal(msg.Payload(), &m); err != nil || m.Type != "full" {
				return
			}
			isFull := m.Value == "true"
			log.Printf("📡 Cabinet full status from ESP32 [%s]: %v", cabinetID, isFull)
			hardware.ForCabinet(cabinetID).SetFull(isFull)
		})

		// Subscribe to ESP32's online/offline presence (publish ตอนต่อสำเร็จ + Last Will ตอนหลุด/ดับ)
		// ใช้บอกฝั่งหน้าเว็บว่าฮาร์ดแวร์จริงต่ออยู่ไหม ไม่ใช่แค่ backend คุย broker ได้
		c.Subscribe("smartlibrary/+/status", 0, func(client mqtt.Client, msg mqtt.Message) {
			cabinetID := cabinetIDFromTopic(msg.Topic())
			connected := string(msg.Payload()) == "online"
			log.Printf("📡 ESP32 status [%s]: %s", cabinetID, msg.Payload())
			hardware.ForCabinet(cabinetID).SetESP32Connected(connected)

			// ตู้ใหม่ที่เพิ่งตั้งค่า WiFiManager ด้วยรหัสตู้ที่ไม่เคยมีในระบบมาก่อน จะขึ้นในหน้า Dashboard
			// ให้เองทันทีตรงนี้ ไม่ต้องมีใครมาเพิ่มในฐานข้อมูลด้วยมือก่อน
			if connected {
				database.EnsureCabinetExists(cabinetID)
			}
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

// ฟังก์ชันจัดการการเชื่อมต่อผ่าน WebSocket สำหรับอุปกรณ์แท็บเล็ต — ต้องระบุ ?cabinet=<cabinet_id> ตอน
// ต่อเข้ามาเสมอ เพื่อให้ backend รู้ว่าแท็บเล็ตเครื่องนี้เป็นของตู้ไหน (ใช้กรองตอนส่งต่อ RFID/barcode)
// ถ้าไม่ส่งมา fallback เป็นตู้เริ่มต้น กันแท็บเล็ตรุ่นเก่าที่ยังไม่ได้อัปเดตโค้ดพังไปเลย
func TabletWS(c *websocket.Conn) {
	cabinetID := c.Query("cabinet", hardware.DefaultCabinetID)

	clientMu.Lock()
	tabletClients[c] = cabinetID
	clientMu.Unlock()

	log.Printf("Tablet connected (cabinet: %s)", cabinetID)

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

// สั่งแท็บเล็ตทุกเครื่องที่ผูกกับตู้นี้อยู่ตอนนี้ (ผ่าน WebSocket ที่ต่อค้างไว้แล้ว) ให้ล้างรหัสตู้ที่
// บันทึกไว้ใน localStorage แล้วกลับไปโชว์หน้าจอตั้งค่าใหม่ — ใช้แก้ตอนพิมพ์รหัสตู้ผิดตอนติดตั้งแท็บเล็ต
// โดยไม่ต้องเดินไปแตะตัวเครื่องเอง (ดูปุ่ม "เคลียร์การตั้งค่าแท็บเล็ต" ในหน้า Dashboard) คืนค่าจำนวน
// แท็บเล็ตที่สั่งสำเร็จ — ถ้าเป็น 0 แปลว่าตอนนี้ไม่มีแท็บเล็ตเครื่องไหนต่อ WebSocket ของตู้นี้อยู่เลย
// (ออฟไลน์/ยังไม่เปิดหน้าเว็บ) ต้องไปกดที่ปุ่มโลโก้ 5 ครั้งที่ตัวเครื่องแทน
func notifyTabletsResetSetup(cabinetID string) int {
	payload, _ := json.Marshal(WSMessage{Type: "reset_setup"})

	clientMu.Lock()
	defer clientMu.Unlock()
	notified := 0
	for wsClient, wsCabinetID := range tabletClients {
		if wsCabinetID != cabinetID {
			continue
		}
		if err := wsClient.WriteMessage(1, payload); err != nil {
			wsClient.Close()
			delete(tabletClients, wsClient)
			continue
		}
		notified++
	}
	return notified
}

func SimulatorSend(c *fiber.Ctx) error {
	var msg WSMessage
	if err := c.BodyParser(&msg); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	payload, _ := json.Marshal(msg)

	// Simulator ยังผูกกับตู้เริ่มต้นตัวเดียวไปก่อน (เครื่องมือทดสอบสำหรับนักพัฒนา ยังไม่รองรับเลือกตู้)
	hw := hardware.ForCabinet(hardware.DefaultCabinetID)

	// อัปเดตสถานะมอเตอร์ใน hardware ด้วย (เดิมปุ่มนี้ส่ง MQTT ไปหา ESP32 ตรงๆ อย่างเดียว
	// ไม่เคยอัปเดต state ฝั่ง backend เลย ทำให้ /api/status และหน้า dashboard/tablet
	// ที่อ่านสถานะมอเตอร์จาก backend ไม่เห็นการเปลี่ยนแปลงจากปุ่มในหน้า Simulator)
	if msg.Type == "motor" {
		switch msg.Value {
		case "open":
			hw.SetOpen()
		case "close":
			hw.SetClosed()
		case "dump":
			hw.SetDump()
		}
	}

	// ส่งสัญญาณไปยังแท็บเล็ตที่ผูกกับตู้เริ่มต้นเท่านั้น (ข้อมูลจาก Barcode หรือ RFID)
	if msg.Type == "barcode" || msg.Type == "rfid" {
		clientMu.Lock()
		for client, cabinetID := range tabletClients {
			if cabinetID != hardware.DefaultCabinetID {
				continue
			}
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
			topic := "smartlibrary/" + hardware.DefaultCabinetID + "/control"
			token := MQTTClient.Publish(topic, 0, false, payload)
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
