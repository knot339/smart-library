package handlers

import (
	"smart-library-api/internal/hardware"

	"github.com/gofiber/fiber/v2"
)

func GetStatus(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"capacity":     hardware.Shared.Capacity,
		"is_full":      hardware.Shared.IsFull,
		"motor_status": hardware.Shared.MotorStatus,
		"motor_logs":   hardware.Shared.MotorLogs,
		"status":       "Ready",
	})
}

func SimulateReturnBook(c *fiber.Ctx) error {
	newCapacity := hardware.Shared.AddBook()
	return c.JSON(fiber.Map{"message": "รับคืนหนังสือสำเร็จ", "capacity": newCapacity})
}

func SimulateReset(c *fiber.Ctx) error {
	hardware.Shared.Capacity = 0
	return c.JSON(fiber.Map{"message": "รีเซ็ตตู้แล้ว", "capacity": 0})
}
