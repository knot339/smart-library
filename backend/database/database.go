package database

import (
	"fmt"
	"os"
	"smart-library-api/models"

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

	// สร้างตารางอัตโนมัติ
	db.AutoMigrate(
		&models.Book{},
		&models.Borrower{},
		&models.BorrowRecord{},
	)

	DB = db
	fmt.Println("✅ เชื่อมต่อฐานข้อมูลสำเร็จ")
}