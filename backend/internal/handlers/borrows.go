package handlers

import (
	"smart-library-api/internal/api"
	"smart-library-api/internal/database"
	"smart-library-api/internal/models"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ค้นหาข้อมูลผู้ยืมจากรหัสประจำตัว หรือหมายเลขโทรศัพท์ผ่าน OPAC API
func FindBorrowerByCode(c *fiber.Ctx) error {
	code := c.Params("code")

	details, err := api.GetPatronDetail(code)
	if err != nil || len(details) == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบข้อมูลในระบบส่วนกลาง กรุณาติดต่อบรรณารักษ์"})
	}

	return c.JSON(details[0])
}

// ค้นหาข้อมูลหนังสือจากรหัส Barcode โดยใช้ฐานข้อมูลของตัวเอง (ไม่พึ่ง OPAC API)
func FindBookByBarcode(c *fiber.Ctx) error {
	barcode := c.Params("barcode")
	var book models.Book
	if err := database.DB.Where("barcode = ?", barcode).First(&book).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบหนังสือในระบบ กรุณาตรวจสอบ Barcode อีกครั้ง"})
	}
	return c.JSON(book)
}

// GetBibInfo API จำลองการดึงข้อมูลบรรณานุกรม
func GetBibInfo(c *fiber.Ctx) error {
	bibid := c.Params("bibid")
	var book models.Book
	if err := database.DB.Where("bib_id = ?", bibid).First(&book).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบข้อมูลบรรณานุกรม"})
	}

	return c.JSON(fiber.Map{
		"BibInfo": []fiber.Map{
			{"FIELD": "ISBN", "DATA": book.ISBN},
			{"FIELD": "Author", "DATA": book.Author},
			{"FIELD": "Title", "DATA": book.Title},
			{"FIELD": "CallNo", "DATA": book.CallNo},
		},
	})
}

// ค้นหารายการหนังสือที่ผู้ยืมยังไม่ได้ดำเนินการส่งคืน (แบบ API จริง)
func GetPatronBorrow(c *fiber.Ctx) error {
	barcode := c.Params("barcode") // USERBARCODE

	borrows, err := api.GetPatronBorrow(barcode)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถดึงข้อมูลการยืมจากส่วนกลางได้"})
	}

	return c.JSON(borrows)
}

// บันทึกการทำรายการคืนหนังสือเข้าสู่ระบบจำลอง (อ้างอิงจากรหัสหนังสือและผู้ยืม)
// ค้นหารายการยืมล่าสุดที่ยังค้างส่ง และบันทึกหมายเลขโทรศัพท์ของผู้ดำเนินการคืน
func ReturnByBorrowerAndBook(c *fiber.Ctx) error {
	type ReturnRequest struct {
		BookBarcode     string `json:"book_barcode"`
		BorrowerCode    string `json:"borrower_code"`
		ReturnedByPhone string `json:"returned_by_phone"`
	}
	req := new(ReturnRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	// บันทึกการคืนลงในฐานข้อมูลจำลองเป็น record ใหม่
	now := time.Now()
	record := models.BorrowRecord{
		BorrowerCode:    req.BorrowerCode,
		BookBarcode:     req.BookBarcode,
		ReturnedByPhone: req.ReturnedByPhone,
		ReturnedAt:      &now,
		Status:          "returned",
		BorrowedAt:      time.Now(), // เราอาจจะไม่รู้วันที่ยืมจริงจาก Request นี้ เว้นแต่ Frontend จะส่งมาด้วย ให้ใช้วันปัจจุบันไปก่อนหรือปล่อยว่าง
	}

	if err := database.DB.Create(&record).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถบันทึกการคืนลงในระบบจำลองได้"})
	}

	return c.JSON(fiber.Map{"message": "บันทึกการคืนลงในระบบจำลองสำเร็จ", "record_id": record.ID})
}

// API เพิ่มเติมสำหรับการจัดการข้อมูลการยืม-คืนแบบทั่วไป
// API เพิ่มเติมสำหรับการจัดการข้อมูลการยืม-คืนแบบทั่วไป พร้อมเติมชื่อ/ผู้แต่งหนังสือจากฐานข้อมูลของตัวเอง
// (BorrowRecord เก็บแค่ BookBarcode ไม่มี FK ผูกกับ Book แล้ว ต้อง join เอาเองตรงนี้)
func GetBorrowRecords(c *fiber.Ctx) error {
	var records []models.BorrowRecord
	database.DB.Order("id desc").Find(&records)

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

	result := make([]fiber.Map, 0, len(records))
	for _, r := range records {
		book := bookByBarcode[r.BookBarcode]
		result = append(result, fiber.Map{
			"id":                r.ID,
			"borrower_code":     r.BorrowerCode,
			"book_barcode":      r.BookBarcode,
			"book_title":        book.Title,
			"book_author":       book.Author,
			"renew":             r.Renew,
			"borrowed_at":       r.BorrowedAt,
			"due_date":          r.DueDate,
			"returned_at":       r.ReturnedAt,
			"returned_by_phone": r.ReturnedByPhone,
			"status":            r.Status,
		})
	}
	return c.JSON(result)
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
	database.DB.First(record, record.ID)
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
