package handlers

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

type WSMessage struct {
	Type  string `json:"type"`  // "barcode" | "rfid"
	Value string `json:"value"` // ค่าที่อ่านได้
}

// เก็บ client ที่เชื่อมต่ออยู่ทั้งหมด
var (
	tabletClients = make(map[*websocket.Conn]bool)
	clientMu      sync.Mutex
)

// Handler สำหรับ Tablet เชื่อมต่อ WebSocket
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

	// รอรับข้อความ (keep-alive)
	for {
		if _, _, err := c.ReadMessage(); err != nil {
			break
		}
	}
}

// esp32Clients
var (
	esp32Clients = make(map[*websocket.Conn]bool)
	esp32Mu      sync.Mutex
)

// ESP32 เชื่อมต่อที่นี่
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

	// ส่งไปยัง Tablet (barcode, rfid)
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

	// ส่งไปยัง ESP32 (led, motor)
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
