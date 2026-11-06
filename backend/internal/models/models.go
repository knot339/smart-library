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

// โครงสร้างข้อมูลสำหรับเก็บค่าตั้งค่าทั่วไปของระบบแบบ key-value (เช่น อีเมลแจ้งเตือนตู้เต็ม)
type Setting struct {
	ID    uint   `gorm:"primaryKey" json:"id"`
	Key   string `gorm:"uniqueIndex;size:50" json:"key"`
	Value string `gorm:"size:255" json:"value"`
}

// โครงสร้างข้อมูลสำหรับ LINE Official Account แต่ละตัวที่ใช้ส่งแจ้งเตือนตอนตู้เต็ม — แยกเป็นคนละแถว
// เพราะแต่ละ OA มี Channel Access Token ของตัวเอง (คนละบัญชี) และส่งไปคนละกลุ่ม/คนละปลายทางกันได้
// Targets เก็บเป็น comma-separated string ของ User/Group ID (เหมือนรูปแบบเดิมก่อนรองรับหลาย OA)
type LineChannel struct {
	ID      uint   `gorm:"primaryKey" json:"id"`
	Token   string `gorm:"size:255" json:"-"` // ไม่ส่งกลับไปที่ frontend ตรงๆ เพราะเทียบเท่ารหัสผ่าน
	Targets string `gorm:"size:1000" json:"targets"`
}

// โครงสร้างข้อมูลสำหรับตู้แต่ละใบ (รองรับระบบแบบหลายตู้) — CabinetID เป็นรหัสที่ผู้ดูแลตั้งเองผ่านหน้า
// WiFiManager ตอน setup บอร์ด ESP32 มอเตอร์ครั้งแรก (เช่น "cabinet-1") ใช้เป็นตัวแบ่ง MQTT topic/สถานะ
// ของแต่ละตู้ไม่ให้ปนกัน
type Cabinet struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	CabinetID  string     `gorm:"uniqueIndex;size:50" json:"cabinet_id"`
	Name       string     `gorm:"size:100" json:"name"`
	Active     bool       `gorm:"default:true" json:"active"`
	LastSeenAt *time.Time `json:"last_seen_at"`
}

// โครงสร้างข้อมูลสำหรับกล้องแต่ละตัวของแต่ละตู้ — กล้องลงทะเบียนตัวเองกับ backend ผ่าน HTTP (ไม่ใช้ MQTT)
// ตอนบูตและเป็นระยะ ส่ง cabinet_id/role/ip ของตัวเองมาอัปเดตแถวนี้ แทนการ hardcode IP ไว้ที่ frontend
type CabinetCamera struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	CabinetID  string    `gorm:"size:50;index" json:"cabinet_id"`
	Role       string    `gorm:"size:20" json:"role"` // "front" หรือ "inside"
	IP         string    `gorm:"size:45" json:"ip"`
	LastSeenAt time.Time `json:"last_seen_at"`
}

// บัญชีเจ้าหน้าที่สำหรับเข้าหน้า Admin (ระบบ login แบบที่ 2 — มี user/รหัสผ่านแยกรายคนจริง ต่างจาก
// Dashboard ที่ใช้รหัสผ่านเดียวร่วมกันทั้งแผนก) PasswordHash เก็บด้วย bcrypt ไม่เก็บรหัสผ่านตรงๆเด็ดขาด
type AdminUser struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	Username           string    `gorm:"size:50;uniqueIndex" json:"username"`
	PasswordHash       string    `gorm:"size:100" json:"-"` // ไม่ส่งออกไปใน JSON ไม่ว่ากรณีไหน
	CanAccessDashboard bool      `gorm:"default:true" json:"can_access_dashboard"` // สิทธิ์เข้าหน้า /dashboard
	CanAccessAdmin     bool      `gorm:"default:true" json:"can_access_admin"`     // สิทธิ์เข้าหน้า /admin
	CanAccessSimulator bool      `gorm:"default:true" json:"can_access_simulator"` // สิทธิ์เข้าหน้า /simulator
	CreatedAt          time.Time `json:"created_at"`
}

// โครงสร้างข้อมูลสำหรับตารางบันทึกการยืม-คืน (BorrowRecord)
type BorrowRecord struct {
	ID              uint       `gorm:"primaryKey" json:"id"`
	BorrowerCode    string     `gorm:"size:20;index" json:"borrower_code"`
	BorrowerName    string     `gorm:"size:100" json:"borrower_name"` // ชื่อผู้ยืม ณ ตอนคืน (มาจาก OPAC ตอน tablet ระบุตัวตน เก็บไว้ตรงนี้เพราะ local ไม่มีชื่อผู้ยืมจริง)
	BookBarcode     string     `gorm:"size:50;index" json:"book_barcode"`
	Renew           int        `gorm:"default:0" json:"renew"`
	BorrowedAt      time.Time  `json:"borrowed_at"`
	DueDate         time.Time  `json:"due_date"`
	ReturnedAt      *time.Time `json:"returned_at"`                              // วันและเวลาที่ดำเนินการคืน (nil หมายถึงยังไม่ส่งคืน)
	ReturnedByPhone string     `gorm:"size:15" json:"returned_by_phone"`         // หมายเลขโทรศัพท์ของผู้ที่ดำเนินการคืน (กรณีผู้ใช้ทั่วไป)
	Status          string     `gorm:"size:20;default:'returned'" json:"status"` // สถานะการทำรายการ ("borrowed" หรือ "returned")
}
