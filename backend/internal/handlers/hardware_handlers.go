package handlers

import (
	"smart-library-api/internal/hardware"

	"github.com/gofiber/fiber/v2"
)

func GetStatus(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"is_full":         hardware.Shared.IsFull,
		"motor_status":    hardware.Shared.MotorStatus,
		"motor_logs":      hardware.Shared.MotorLogs,
		"fast_mode":       hardware.Shared.FastMode,
		"force_empty":     hardware.Shared.ForceEmpty,
		"esp32_connected": hardware.Shared.ESP32Connected,
		"is_locked":       hardware.Shared.IsLocked,
		"status":          "Ready",
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

// ใช้ตอนยังไม่ได้ต่อเซนเซอร์ Ultrasonic จริง (ขา ECHO ลอยจะสุ่มขึ้นเต็ม/ว่างสลับไปมา)
// เปิดโหมดนี้ไว้เพื่อบังคับสถานะตู้ว่างเสมอ ไม่ว่าจะมีสัญญาณจากเซนเซอร์ส่งเข้ามาหรือไม่
func SetForceEmpty(c *fiber.Ctx) error {
	type SetForceEmptyRequest struct {
		ForceEmpty bool `json:"force_empty"`
	}
	req := new(SetForceEmptyRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	hardware.Shared.SetForceEmpty(req.ForceEmpty)
	return c.JSON(fiber.Map{
		"message":     "ตั้งค่าโหมดบังคับตู้ว่างสำเร็จ",
		"force_empty": hardware.Shared.ForceEmpty,
		"is_full":     hardware.Shared.IsFull,
	})
}
