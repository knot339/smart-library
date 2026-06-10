package handlers

import (
	"smart-library-api/internal/database"
	"smart-library-api/internal/hardware"
	"smart-library-api/internal/models"

	"github.com/gofiber/fiber/v2"
)

func GetCabinetStatus(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"capacity":     hardware.Shared.Capacity,
		"is_full":      hardware.Shared.IsFull,
		"motor_status": hardware.Shared.MotorStatus,
		"status":       "online",
	})
}

func OpenMotor(c *fiber.Ctx) error {
	hardware.Shared.SetOpen()
	return c.JSON(fiber.Map{
		"message":      "เปิดรับหนังสือแล้ว",
		"motor_status": hardware.Shared.MotorStatus,
	})
}

func CloseMotor(c *fiber.Ctx) error {
	hardware.Shared.SetClosed()
	return c.JSON(fiber.Map{
		"message":      "ปิดตู้แล้ว",
		"motor_status": hardware.Shared.MotorStatus,
	})
}

func DumpMotor(c *fiber.Ctx) error {
	hardware.Shared.SetDump()
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
	database.DB.Preload("Book").Preload("Borrower").
		Where("status = ? AND returned_at IS NOT NULL", "returned").
		Order("returned_at DESC").
		Find(&records)

	bookMap := make(map[uint]fiber.Map)
	for _, r := range records {
		if _, exists := bookMap[r.BookID]; !exists {
			bookMap[r.BookID] = fiber.Map{
				"id":          r.Book.ID,
				"title":       r.Book.Title,
				"author":      r.Book.Author,
				"isbn":              r.Book.ISBN,
				"returned_at":       r.ReturnedAt,
				"returned_by":       r.Borrower.Name,
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
	database.DB.Preload("Book").Preload("Borrower").
		Where("status IN ?", []string{"returned", "archived"}).
		Order("returned_at DESC").
		Limit(20).
		Find(&records)
	return c.JSON(records)
}

func ResetCabinet(c *fiber.Ctx) error {
	hardware.Shared.Capacity = 0
	hardware.Shared.SetClosed()

	database.DB.Model(&models.BorrowRecord{}).
		Where("status = ?", "returned").
		Update("status", "archived")

	return c.JSON(fiber.Map{
		"message":      "รีเซ็ตรายการในตู้สำเร็จ",
		"motor_status": hardware.Shared.MotorStatus,
	})
}
