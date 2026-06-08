package handlers

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

type WSMessage struct {
	Type  string `json:"type"`  // ประเภทของอุปกรณ์ ("barcode" หรือ "rfid")
	Value string `json:"value"` // ข้อมูลที่อ่านได้จากอุปกรณ์
}

// ตัวแปรสำหรับจัดเก็บรายชื่ออุปกรณ์แท็บเล็ตที่เชื่อมต่ออยู่
var (
	tabletClients = make(map[*websocket.Conn]bool)
	clientMu      sync.Mutex
)

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

// ตัวแปรสำหรับจัดเก็บรายชื่ออุปกรณ์ ESP32 ที่เชื่อมต่ออยู่
var (
	esp32Clients = make(map[*websocket.Conn]bool)
	esp32Mu      sync.Mutex
)

// ฟังก์ชันจัดการการเชื่อมต่อผ่าน WebSocket สำหรับอุปกรณ์ ESP32
func ESP32WS(c *websocket.Conn) {
	esp32Mu.Lock()
	esp32Clients[c] = true
	esp32Mu.Unlock()

	log.Println("✅ ESP32 connected")

	defer func() {
		esp32Mu.Lock()
		delete(esp32Clients, c)
		esp32Mu.Unlock()
		c.Close()
		log.Println("❌ ESP32 disconnected")
	}()

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

	// ส่งคำสั่งไปยังอุปกรณ์ ESP32 (สั่งการ LED หรือมอเตอร์)
	if msg.Type == "led" || msg.Type == "motor" {
		esp32Mu.Lock()
		for client := range esp32Clients {
			if err := client.WriteMessage(1, payload); err != nil {
				client.Close()
				delete(esp32Clients, client)
			}
		}
		esp32Mu.Unlock()
	}

	return c.JSON(fiber.Map{
		"message": "ส่งสัญญาณสำเร็จ",
		"clients": len(tabletClients),
	})
}
