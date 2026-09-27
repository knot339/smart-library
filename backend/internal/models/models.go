package models

import "time"

// โครงสร้างข้อมูลสำหรับตารางหนังสือ (Book)
type Book struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	ISBN      string    `gorm:"size:20" json:"isbn"` // ข้อมูล ITEM จากห้องสมุดจริงไม่มี ISBN ต่อรายการ จึงไม่บังคับ unique (มีได้หลายเล่มที่ค่าว่าง)
	Title     string    `gorm:"size:500" json:"title"`
	Author    string    `gorm:"size:255" json:"author"`
	Category  string    `gorm:"size:50" json:"category"`
	Barcode   string    `gorm:"uniqueIndex;size:50" json:"barcode"`
	BibID     string    `gorm:"size:50" json:"bibid"`
	CallNo    string    `gorm:"size:100" json:"callno"`
	MatTypeID int       `gorm:"default:1" json:"mattypeid"`
	Stock     int       `gorm:"default:1" json:"stock"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// โครงสร้างข้อมูลสำหรับตารางผู้ใช้งาน (Borrower)
type Borrower struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Code      string    `gorm:"uniqueIndex;size:20" json:"code"` // รหัสประจำตัวนักศึกษา หรือหมายเลขโทรศัพท์
	Name      string    `gorm:"size:100" json:"name"`
	Type      string    `gorm:"size:20" json:"type"` // ประเภทผู้ใช้งาน ("student" หรือ "external")
	Phone     string    `gorm:"size:15" json:"phone"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// โครงสร้างข้อมูลสำหรับตารางบันทึกการยืม-คืน (BorrowRecord)
type BorrowRecord struct {
	ID              uint       `gorm:"primaryKey" json:"id"`
	BorrowerCode    string     `gorm:"size:20;index" json:"borrower_code"`
	BookBarcode     string     `gorm:"size:50;index" json:"book_barcode"`
	Renew           int        `gorm:"default:0" json:"renew"`
	BorrowedAt      time.Time  `json:"borrowed_at"`
	DueDate         time.Time  `json:"due_date"`
	ReturnedAt      *time.Time `json:"returned_at"`                              // วันและเวลาที่ดำเนินการคืน (nil หมายถึงยังไม่ส่งคืน)
	ReturnedByPhone string     `gorm:"size:15" json:"returned_by_phone"`         // หมายเลขโทรศัพท์ของผู้ที่ดำเนินการคืน (กรณีผู้ใช้ทั่วไป)
	Status          string     `gorm:"size:20;default:'returned'" json:"status"` // สถานะการทำรายการ ("borrowed" หรือ "returned")
}
