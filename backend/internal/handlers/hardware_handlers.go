package handlers

import (
	"smart-library-api/internal/hardware"

	"github.com/gofiber/fiber/v2"
)

func GetStatus(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"is_full":      hardware.Shared.IsFull,
		"motor_status": hardware.Shared.MotorStatus,
		"motor_logs":   hardware.Shared.MotorLogs,
		"fast_mode":    hardware.Shared.FastMode,
		"status":       "Ready",
	})
}

func SimulateReturnBook(c *fiber.Ctx) error {
	hardware.Shared.AddBook()
	return c.JSON(fiber.Map{"message": "รับคืนหนังสือสำเร็จ"})
}

func SimulateReset(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"message": "รีเซ็ตตู้แล้ว"})
}

func SetFastMode(c *fiber.Ctx) error {
	type SetFastModeRequest struct {
		FastMode bool `json:"fast_mode"`
	}
	req := new(SetFastModeRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	hardware.Shared.SetFastMode(req.FastMode)
	return c.JSON(fiber.Map{
		"message":   "ตั้งค่าโหมด Fast Mode สำเร็จ",
		"fast_mode": hardware.Shared.FastMode,
	})
}
