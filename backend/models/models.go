package models

import "time"

// ตารางหนังสือ
type Book struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	ISBN      string    `gorm:"uniqueIndex;size:20" json:"isbn"`
	Title     string    `gorm:"size:200" json:"title"`
	Author    string    `gorm:"size:100" json:"author"`
	Category  string    `gorm:"size:50" json:"category"`
	Stock     int       `gorm:"default:1" json:"stock"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ตารางผู้ยืม
type Borrower struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Code      string    `gorm:"uniqueIndex;size:20" json:"code"` // รหัสนักศึกษา หรือเบอร์โทร
	Name      string    `gorm:"size:100" json:"name"`
	Type      string    `gorm:"size:20" json:"type"` // "student" หรือ "external"
	Phone     string    `gorm:"size:15" json:"phone"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ตารางรายการยืม-คืน
type BorrowRecord struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	BorrowerID uint       `json:"borrower_id"`
	Borrower   Borrower   `gorm:"foreignKey:BorrowerID" json:"borrower"`
	BookID     uint       `json:"book_id"`
	Book       Book       `gorm:"foreignKey:BookID" json:"book"`
	BorrowedAt time.Time  `json:"borrowed_at"`
	DueDate    time.Time  `json:"due_date"`
	ReturnedAt *time.Time `json:"returned_at"` // nil = ยังไม่คืน
	Status     string     `gorm:"size:20;default:'borrowed'" json:"status"` // borrowed / returned
}