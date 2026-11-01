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
		&models.Setting{},
		&models.LineChannel{},
	)

	DB = db
	migrateLegacyLineSettings()
	fmt.Println("✅ เชื่อมต่อฐานข้อมูลสำเร็จ")
}

// migrateLegacyLineSettings ย้ายค่า LINE token/target เดิม (เก็บเป็น setting key-value เดี่ยวๆ
// ก่อนที่จะรองรับหลาย LINE Official Account) มาเป็นแถวแรกในตาราง line_channels ให้อัตโนมัติครั้งเดียว
// ตอนสตาร์ท — AutoMigrate สร้างแค่โครงสร้างตารางใหม่ให้ ไม่ได้แปลงข้อมูลเก่าให้เอง ถ้าไม่ทำตรงนี้
// ผู้ที่เคยตั้งค่า LINE ไว้ก่อนอัปเดตจะเห็นหน้า Dashboard ขึ้น 0 บัญชี ทั้งที่ยังไม่ได้ตั้งค่าใหม่จริงๆ
func migrateLegacyLineSettings() {
	var existingCount int64
	DB.Model(&models.LineChannel{}).Count(&existingCount)
	if existingCount > 0 {
		return // เคยมีการตั้งค่าแบบใหม่อยู่แล้ว ไม่ต้องย้ายข้อมูลเก่าทับ
	}

	var tokenSetting, targetSetting models.Setting
	hasToken := DB.Where("key = ?", "notify_line_token").First(&tokenSetting).Error == nil && tokenSetting.Value != ""
	hasTarget := DB.Where("key = ?", "notify_line_target_id").First(&targetSetting).Error == nil && targetSetting.Value != ""
	if !hasToken || !hasTarget {
		return // ไม่เคยตั้งค่า LINE แบบเก่าไว้เลย ไม่มีอะไรต้องย้าย
	}

	channel := models.LineChannel{Token: tokenSetting.Value, Targets: targetSetting.Value}
	if err := DB.Create(&channel).Error; err != nil {
		fmt.Println("⚠️ ย้ายค่าตั้งค่า LINE เดิมไม่สำเร็จ:", err)
		return
	}

	// ลบ setting เดิมทิ้ง กันสับสนว่ายังใช้อยู่ (โค้ดปัจจุบันไม่อ่านค่าจาก key พวกนี้แล้ว)
	DB.Where("key IN ?", []string{"notify_line_token", "notify_line_target_id"}).Delete(&models.Setting{})
	fmt.Printf("📱 ย้ายค่าตั้งค่า LINE เดิมมาเป็น LINE Official Account #%d สำเร็จ\n", channel.ID)
}
