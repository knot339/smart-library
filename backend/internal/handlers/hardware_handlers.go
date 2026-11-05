package handlers

import (
	"smart-library-api/internal/hardware"

	"github.com/gofiber/fiber/v2"
)

// เส้นทางในไฟล์นี้ทั้งหมด (/api/status, /api/simulate/*) ยังไม่รับ cabinet_id จาก URL — ผูกกับตู้
// เริ่มต้น (hardware.DefaultCabinetID) ไปก่อนเพื่อให้โค้ด frontend เดิม (tablet/dashboard/simulator
// ที่ยังไม่ได้อัปเดตมารับส่ง cabinet_id) ใช้งานได้ต่อเนื่องไม่พังระหว่างทำระบบหลายตู้ (ดู routes.go
// /api/dashboard/cabinet/:id/... สำหรับเส้นทางใหม่ที่รองรับหลายตู้จริงแล้ว)
func GetStatus(c *fiber.Ctx) error {
	hw := hardware.ForCabinet(hardware.DefaultCabinetID)
	return c.JSON(fiber.Map{
		"is_full":         hw.IsFull,
		"motor_status":    hw.MotorStatus,
		"motor_logs":      hw.MotorLogs,
		"fast_mode":       hw.FastMode,
		"force_empty":     hw.ForceEmpty,
		"esp32_connected": hw.ESP32Connected,
		"is_locked":       hw.IsLocked,
		"status":          "Ready",
	})
}

func SimulateReturnBook(c *fiber.Ctx) error {
	hardware.ForCabinet(hardware.DefaultCabinetID).AddBook()
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
	hw := hardware.ForCabinet(hardware.DefaultCabinetID)
	hw.SetFastMode(req.FastMode)
	return c.JSON(fiber.Map{
		"message":   "ตั้งค่าโหมด Fast Mode สำเร็จ",
		"fast_mode": hw.FastMode,
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
	hw := hardware.ForCabinet(hardware.DefaultCabinetID)
	hw.SetForceEmpty(req.ForceEmpty)
	return c.JSON(fiber.Map{
		"message":     "ตั้งค่าโหมดบังคับตู้ว่างสำเร็จ",
		"force_empty": hw.ForceEmpty,
		"is_full":     hw.IsFull,
	})
}
