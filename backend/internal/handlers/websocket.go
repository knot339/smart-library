package handlers

import (
	"encoding/json"
	"log"
	"sync"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type WSMessage struct {
	Type  string `json:"type"`  // ประเภทของอุปกรณ์ ("barcode" หรือ "rfid", "led", "motor")
	Value string `json:"value"` // ข้อมูลที่อ่านได้จากอุปกรณ์ หรือสถานะ
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

