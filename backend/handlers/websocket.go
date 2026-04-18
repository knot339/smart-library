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

// Handler สำหรับ Simulator ส่งค่าจำลอง
func SimulatorSend(c *fiber.Ctx) error {
	var msg WSMessage
	if err := c.BodyParser(&msg); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	// ส่งไปยัง Tablet ทุกตัวที่เชื่อมต่ออยู่
	payload, _ := json.Marshal(msg)
	clientMu.Lock()
	for client := range tabletClients {
		if err := client.WriteMessage(1, payload); err != nil {
			client.Close()
			delete(tabletClients, client)
		}
	}
	clientMu.Unlock()

	return c.JSON(fiber.Map{"message": "ส่งสัญญาณสำเร็จ", "clients": len(tabletClients)})
}