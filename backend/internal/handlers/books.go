package handlers

import (
	"strconv"
	"strings"

	"smart-library-api/internal/database"
	"smart-library-api/internal/models"

	"github.com/gofiber/fiber/v2"
)

// ดึงรายการหนังสือแบบแบ่งหน้า พร้อมค้นหาได้ (ตาราง books มีหลักแสนแถวจากข้อมูลห้องสมุดจริง
// ถ้าดึงทั้งหมดมาทีเดียวจะทำให้หน้า Admin โหลดช้ามาก/ค้าง)
func GetBooks(c *fiber.Ctx) error {
	page, _ := strconv.Atoi(c.Query("page", "1"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	if limit < 1 || limit > 200 {
		limit = 50
	}
	search := strings.TrimSpace(c.Query("search", ""))

	query := database.DB.Model(&models.Book{})
	if search != "" {
		like := "%" + search + "%"
		query = query.Where("title ILIKE ? OR barcode ILIKE ? OR author ILIKE ? OR isbn ILIKE ?", like, like, like, like)
	}

	var total int64
	query.Count(&total)

	var books []models.Book
	query.Order("id").Offset((page - 1) * limit).Limit(limit).Find(&books)

	return c.JSON(fiber.Map{
		"books": books,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

func CreateBook(c *fiber.Ctx) error {
	book := new(models.Book)
	if err := c.BodyParser(book); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	result := database.DB.Create(book)
	if result.Error != nil {
		return c.Status(500).JSON(fiber.Map{"error": result.Error.Error()})
	}
	return c.Status(201).JSON(book)
}

func UpdateBook(c *fiber.Ctx) error {
	id := c.Params("id")
	var book models.Book
	if err := database.DB.First(&book, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบหนังสือ"})
	}
	if err := c.BodyParser(&book); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	database.DB.Save(&book)
	return c.JSON(book)
}

func DeleteBook(c *fiber.Ctx) error {
	id := c.Params("id")
	database.DB.Delete(&models.Book{}, id)
	return c.JSON(fiber.Map{"message": "ลบหนังสือสำเร็จ"})
}
