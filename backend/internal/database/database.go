package database

import (
	"fmt"
	"os"
	"smart-library-api/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Connect() {
	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=disable",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
		os.Getenv("DB_PORT"),
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		panic("เชื่อมต่อฐานข้อมูลไม่ได้: " + err.Error())
	}

	// ดำเนินการสร้างหรืออัปเดตโครงสร้างตารางในฐานข้อมูลอัตโนมัติ
	db.AutoMigrate(
		&models.Book{},
		&models.Borrower{},
		&models.BorrowRecord{},
	)

	DB = db
	fmt.Println("✅ เชื่อมต่อฐานข้อมูลสำเร็จ")
	
	// ปิดการเรียกใช้งานเพื่อไม่ให้เพิ่มข้อมูลจำลองใหม่ทุกครั้งที่เปิดระบบ
	// seedMockData(db)
}

func seedMockData(db *gorm.DB) {
	var count int64
	
	db.Model(&models.Book{}).Where("barcode = ?", "T0150936").Count(&count)
	if count == 0 {
		b1 := models.Book{
				Barcode:   "T0150936",
				ISBN:      "MOCK-001",
				BibID:     "b00008827",
				Title:     "สารสนเทศในบริบทสังคม / ประภาวดี สืบสนธ์.",
				MatTypeID: 1,
				Author:    "ประภาวดี สืบสนธ์",
				CallNo:    "020ป1711ส",
				Stock:     1,
		}
		db.Create(&b1)
	}

	db.Model(&models.Book{}).Where("barcode = ?", "T0166164").Count(&count)
	if count == 0 {
		b2 := models.Book{
				Barcode:   "T0166164",
				ISBN:      "MOCK-002",
				BibID:     "b00049767",
				Title:     "มือใหม่สร้างฟรีเว็บไซต์ใช้งานจริง Joomla PHP-Nuke PHP BB / มานิตย์ กริ่งรัมย์.",
				MatTypeID: 1,
				Author:    "มานิตย์ กริ่งรัมย์",
				CallNo:    "006.7ม253ม",
				Stock:     1,
		}
		db.Create(&b2)
	}
	
	db.Model(&models.Borrower{}).Where("code = ?", "123456789").Count(&count)
	var borrower models.Borrower
	if count == 0 {
		borrower = models.Borrower{
			Code:  "123456789", // Mock USERBARCODE
			Name:  "Test Patron",
			Type:  "student",
			Phone: "0801234567",
		}
		db.Create(&borrower)
	} else {
		db.Where("code = ?", "123456789").First(&borrower)
	}

	// Create mock borrow records for these
	var b1, b2 models.Book
	db.Where("barcode = ?", "T0150936").First(&b1)
	db.Where("barcode = ?", "T0166164").First(&b2)
	
	db.Model(&models.BorrowRecord{}).Where("book_id = ?", b1.ID).Count(&count)
	if count == 0 {
		db.Create(&models.BorrowRecord{
			BorrowerID: borrower.ID,
			BookID:     b1.ID,
			Renew:      0,
			Status:     "borrowed",
		})
	}
	db.Model(&models.BorrowRecord{}).Where("book_id = ?", b2.ID).Count(&count)
	if count == 0 {
		db.Create(&models.BorrowRecord{
			BorrowerID: borrower.ID,
			BookID:     b2.ID,
			Renew:      1,
			Status:     "borrowed",
		})
	}
	
	fmt.Println("✅ ตรวจสอบและสร้างข้อมูลจำลอง (Mock Data) สำเร็จ")
}
