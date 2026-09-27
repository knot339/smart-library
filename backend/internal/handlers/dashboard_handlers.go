package handlers

import (
	"encoding/json"
	"time"

	"smart-library-api/internal/database"
	"smart-library-api/internal/hardware"
	"smart-library-api/internal/models"

	"github.com/gofiber/fiber/v2"
)

func publishMotor(status string) {
	if MQTTClient != nil && MQTTClient.IsConnected() {
		msg := WSMessage{Type: "motor", Value: status}
		payload, _ := json.Marshal(msg)
		token := MQTTClient.Publish("smartlibrary/esp32/control", 0, false, payload)
		token.WaitTimeout(2 * time.Second)
	}
}

func GetCabinetStatus(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"is_full":      hardware.Shared.IsFull,
		"motor_status": hardware.Shared.MotorStatus,
		"status":       "online",
	})
}

func OpenMotor(c *fiber.Ctx) error {
	hardware.Shared.SetOpen()
	publishMotor("open")
	return c.JSON(fiber.Map{
		"message":      "เปิดรับหนังสือแล้ว",
		"motor_status": hardware.Shared.MotorStatus,
	})
}

func CloseMotor(c *fiber.Ctx) error {
	hardware.Shared.SetClosed()
	publishMotor("close")
	return c.JSON(fiber.Map{
		"message":      "ปิดตู้แล้ว",
		"motor_status": hardware.Shared.MotorStatus,
	})
}

func DumpMotor(c *fiber.Ctx) error {
	hardware.Shared.SetDump()
	publishMotor("dump")
	return c.JSON(fiber.Map{
		"message":      "เทหนังสือลงเก็บแล้ว",
		"motor_status": hardware.Shared.MotorStatus,
	})
}

func SetCabinetFull(c *fiber.Ctx) error {
	type SetFullRequest struct {
		IsFull bool `json:"is_full"`
	}
	req := new(SetFullRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	hardware.Shared.SetFull(req.IsFull)
	return c.JSON(fiber.Map{
		"message": "ตั้งค่าสถานะตู้สำเร็จ",
		"is_full": hardware.Shared.IsFull,
	})
}

func GetBooksInCabinet(c *fiber.Ctx) error {
	var records []models.BorrowRecord
	database.DB.
		Where("status = ? AND returned_at IS NOT NULL", "returned").
		Order("returned_at DESC").
		Find(&records)

	// ดึงรายละเอียดหนังสือ (ชื่อ/ผู้แต่ง/ISBN) จากฐานข้อมูลของตัวเองมาแสดงประกอบ
	// BorrowRecord เก็บแค่ BookBarcode ไม่มี FK ผูกกับ Book แล้ว จึงต้องมา join เอาเองตรงนี้
	barcodes := make([]string, 0, len(records))
	seen := map[string]bool{}
	for _, r := range records {
		if r.BookBarcode != "" && !seen[r.BookBarcode] {
			seen[r.BookBarcode] = true
			barcodes = append(barcodes, r.BookBarcode)
		}
	}
	var bookList []models.Book
	if len(barcodes) > 0 {
		database.DB.Where("barcode IN ?", barcodes).Find(&bookList)
	}
	bookByBarcode := make(map[string]models.Book, len(bookList))
	for _, b := range bookList {
		bookByBarcode[b.Barcode] = b
	}

	bookMap := make(map[string]fiber.Map)
	for _, r := range records {
		if _, exists := bookMap[r.BookBarcode]; !exists {
			title, author, isbn := r.BookBarcode, "-", "-"
			if b, ok := bookByBarcode[r.BookBarcode]; ok {
				title = b.Title
				author = b.Author
				if b.ISBN != "" {
					isbn = b.ISBN
				}
			}
			bookMap[r.BookBarcode] = fiber.Map{
				"id":                r.ID,
				"barcode":           r.BookBarcode,
				"title":             title,
				"author":            author,
				"isbn":              isbn,
				"returned_at":       r.ReturnedAt,
				"returned_by":       r.BorrowerCode,
				"returned_by_phone": r.ReturnedByPhone,
			}
		}
	}

	books := make([]fiber.Map, 0, len(bookMap))
	for _, b := range bookMap {
		books = append(books, b)
	}
	return c.JSON(fiber.Map{"count": len(books), "books": books})
}

func GetRecentReturns(c *fiber.Ctx) error {
	var records []models.BorrowRecord
	database.DB.
		Where("status IN ?", []string{"returned", "archived"}).
		Order("returned_at DESC").
		Limit(20).
		Find(&records)
	return c.JSON(records)
}

func ResetCabinet(c *fiber.Ctx) error {
	hardware.Shared.SetClosed()

	database.DB.Model(&models.BorrowRecord{}).
		Where("status = ?", "returned").
		Update("status", "archived")

	return c.JSON(fiber.Map{
		"message":      "รีเซ็ตรายการในตู้สำเร็จ",
		"motor_status": hardware.Shared.MotorStatus,
	})
}
