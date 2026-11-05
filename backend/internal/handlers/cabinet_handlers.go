package handlers

import (
	"time"

	"smart-library-api/internal/database"
	"smart-library-api/internal/hardware"
	"smart-library-api/internal/models"

	"github.com/gofiber/fiber/v2"
)

// GetCabinets คืนรายการตู้ทั้งหมดในระบบ พร้อมสถานะ online/offline (จาก ESP32Connected ของ
// hardware.ForCabinet) และ active/inactive (จากฐานข้อมูล) ให้หน้า Dashboard แสดงเป็นภาพรวมตู้ทั้งหมด
func GetCabinets(c *fiber.Ctx) error {
	var cabinets []models.Cabinet
	database.DB.Order("id asc").Find(&cabinets)

	result := make([]fiber.Map, 0, len(cabinets))
	for _, cab := range cabinets {
		hw := hardware.ForCabinet(cab.CabinetID)
		result = append(result, fiber.Map{
			"id":           cab.ID,
			"cabinet_id":   cab.CabinetID,
			"name":         cab.Name,
			"active":       cab.Active,
			"online":       hw.ESP32Connected,
			"is_full":      hw.IsFull,
			"motor_status": hw.MotorStatus,
			"is_locked":    hw.IsLocked,
			"last_seen_at": cab.LastSeenAt,
		})
	}
	return c.JSON(fiber.Map{"cabinets": result})
}

// GetCabinetDetail คืนรายละเอียดของตู้เดียว รวมกล้องที่ลงทะเบียนไว้ด้วย ใช้โดยหน้า Dashboard ตอนกด
// เข้าไปดูตู้ใดตู้หนึ่งจากหน้ารวมรายชื่อ
func GetCabinetDetail(c *fiber.Ctx) error {
	cabinetID := c.Params("id")

	var cab models.Cabinet
	if err := database.DB.Where("cabinet_id = ?", cabinetID).First(&cab).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบตู้นี้"})
	}

	var cameras []models.CabinetCamera
	database.DB.Where("cabinet_id = ?", cabinetID).Order("role asc").Find(&cameras)

	hw := hardware.ForCabinet(cabinetID)
	return c.JSON(fiber.Map{
		"id":           cab.ID,
		"cabinet_id":   cab.CabinetID,
		"name":         cab.Name,
		"active":       cab.Active,
		"online":       hw.ESP32Connected,
		"is_full":      hw.IsFull,
		"motor_status": hw.MotorStatus,
		"is_locked":    hw.IsLocked,
		"fast_mode":    hw.FastMode,
		"last_seen_at": cab.LastSeenAt,
		"cameras":      cameras,
	})
}

// SetCabinetActive เปิด/ปิดให้บริการตู้ใดตู้หนึ่ง — ปิดแล้วแท็บเล็ตของตู้นั้นจะขึ้นหน้าจอ "ปิดให้บริการ
// ชั่วคราว" และบล็อกการคืนหนังสือทั้งหมด (อ่านค่านี้ผ่าน GET /api/cabinets/:id ที่หน้าแท็บเล็ตต้อง poll เอง)
func SetCabinetActive(c *fiber.Ctx) error {
	cabinetID := c.Params("id")
	state := c.Params("state")
	if state != "activate" && state != "deactivate" {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบเส้นทางนี้"})
	}
	active := state == "activate"

	var cab models.Cabinet
	if err := database.DB.Where("cabinet_id = ?", cabinetID).First(&cab).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบตู้นี้"})
	}

	cab.Active = active
	database.DB.Save(&cab)

	message := "เปิดให้บริการตู้แล้ว"
	if !active {
		message = "ปิดให้บริการตู้ชั่วคราวแล้ว"
	}
	return c.JSON(fiber.Map{"message": message, "active": cab.Active})
}

// RegisterCabinetCamera รับการลงทะเบียนตัวเองของกล้อง ESP32-CAM — บอร์ดกล้องยิง HTTP POST มาเองตอนบูต
// และเป็นระยะ (ไม่ใช้ MQTT เพราะเฟิร์มแวร์กล้องไม่มี MQTT client อยู่แล้ว) อัปเซิร์ตตาม (cabinet_id, role)
func RegisterCabinetCamera(c *fiber.Ctx) error {
	type RegisterRequest struct {
		CabinetID string `json:"cabinet_id"`
		Role      string `json:"role"`
		IP        string `json:"ip"`
	}
	req := new(RegisterRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	if req.CabinetID == "" || req.Role == "" || req.IP == "" {
		return c.Status(400).JSON(fiber.Map{"error": "ต้องระบุ cabinet_id, role และ ip"})
	}

	// เผื่อกล้องลงทะเบียนเข้ามาก่อนที่บอร์ดมอเตอร์ของตู้เดียวกันจะเคยออนไลน์เลย (เช่น flash/ตั้งค่ากล้อง
	// เสร็จก่อน) กันไม่ให้ข้อมูลกล้องกลายเป็นของตู้ที่ไม่มีอยู่จริงในหน้า Dashboard
	database.EnsureCabinetExists(req.CabinetID)

	var cam models.CabinetCamera
	now := time.Now()
	err := database.DB.Where("cabinet_id = ? AND role = ?", req.CabinetID, req.Role).First(&cam).Error
	if err != nil {
		cam = models.CabinetCamera{CabinetID: req.CabinetID, Role: req.Role, IP: req.IP, LastSeenAt: now}
		database.DB.Create(&cam)
	} else {
		cam.IP = req.IP
		cam.LastSeenAt = now
		database.DB.Save(&cam)
	}

	return c.JSON(fiber.Map{"message": "ลงทะเบียนกล้องสำเร็จ"})
}
