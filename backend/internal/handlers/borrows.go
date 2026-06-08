package handlers

import (
	"smart-library-api/internal/database"
	"smart-library-api/internal/models"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ค้นหาข้อมูลผู้ยืมจากรหัสประจำตัว หรือหมายเลขโทรศัพท์
func FindBorrowerByCode(c *fiber.Ctx) error {
	code := c.Params("code")
	var borrower models.Borrower
	if err := database.DB.Where("code = ? OR phone = ?", code, code).First(&borrower).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบข้อมูลในระบบ กรุณาติดต่อบรรณารักษ์"})
	}
	return c.JSON(borrower)
}

// ค้นหาข้อมูลหนังสือจากรหัส ISBN
func FindBookByISBN(c *fiber.Ctx) error {
	isbn := c.Params("isbn")
	var book models.Book
	if err := database.DB.Where("isbn = ?", isbn).First(&book).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบหนังสือในระบบ"})
	}
	return c.JSON(book)
}

// ค้นหารายการหนังสือที่ผู้ยืมยังไม่ได้ดำเนินการส่งคืน
func GetActiveBorrows(c *fiber.Ctx) error {
	borrowerID := c.Params("borrower_id")
	var records []models.BorrowRecord
	database.DB.Preload("Book").Preload("Borrower").
		Where("borrower_id = ? AND status = ?", borrowerID, "borrowed").
		Find(&records)
	return c.JSON(records)
}

// บันทึกการทำรายการคืนหนังสือเข้าสู่ระบบ (อ้างอิงจากรหัสหนังสือ)
// ค้นหารายการยืมล่าสุดที่ยังค้างส่ง และบันทึกหมายเลขโทรศัพท์ของผู้ดำเนินการคืน
func ReturnByBorrowerAndBook(c *fiber.Ctx) error {
	type ReturnRequest struct {
		BookID          uint   `json:"book_id"`
		BorrowerID      uint   `json:"borrower_id"`
		ReturnedByPhone string `json:"returned_by_phone"`
	}
	req := new(ReturnRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	// ค้นหาข้อมูลการทำรายการยืมล่าสุดที่สถานะยังเป็น 'กำลังยืม'
	var record models.BorrowRecord
	err := database.DB.
		Where("book_id = ? AND status = ?", req.BookID, "borrowed").
		Order("borrowed_at DESC").
		First(&record).Error

	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบรายการยืมหนังสือเล่มนี้"})
	}

	// บันทึกหมายเลขโทรศัพท์ของผู้ที่นำหนังสือมาคืน
	if req.ReturnedByPhone != "" {
		record.ReturnedByPhone = req.ReturnedByPhone
	}

	// อัปเดตสถานะการทำรายการเป็น 'คืนแล้ว'
	now := time.Now()
	record.ReturnedAt = &now
	record.Status = "returned"
	database.DB.Save(&record)

	return c.JSON(fiber.Map{"message": "บันทึกการคืนสำเร็จ", "record_id": record.ID})
}

// API เพิ่มเติมสำหรับการจัดการข้อมูลการยืม-คืนแบบทั่วไป
func GetBorrowRecords(c *fiber.Ctx) error {
	var records []models.BorrowRecord
	database.DB.Preload("Book").Preload("Borrower").Find(&records)
	return c.JSON(records)
}

func CreateBorrowRecord(c *fiber.Ctx) error {
	record := new(models.BorrowRecord)
	if err := c.BodyParser(record); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	record.BorrowedAt = time.Now()
	record.DueDate = time.Now().AddDate(0, 0, 14)
	record.Status = "borrowed"
	result := database.DB.Create(record)
	if result.Error != nil {
		return c.Status(500).JSON(fiber.Map{"error": result.Error.Error()})
	}
	database.DB.Preload("Book").Preload("Borrower").First(record, record.ID)
	return c.Status(201).JSON(record)
}

func ReturnBook(c *fiber.Ctx) error {
	id := c.Params("id")
	var record models.BorrowRecord
	if err := database.DB.First(&record, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบรายการ"})
	}
	now := time.Now()
	record.ReturnedAt = &now
	record.Status = "returned"
	database.DB.Save(&record)
	return c.JSON(fiber.Map{"message": "บันทึกการคืนสำเร็จ"})
}

func DeleteBorrowRecord(c *fiber.Ctx) error {
	id := c.Params("id")
	database.DB.Delete(&models.BorrowRecord{}, id)
	return c.JSON(fiber.Map{"message": "ลบรายการสำเร็จ"})
}
