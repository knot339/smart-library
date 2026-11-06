package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"sync"
	"time"

	"smart-library-api/internal/database"
	"smart-library-api/internal/models"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
)

// ระบบ login เดียวของทั้งระบบ (user/รหัสผ่านแยกรายคนจริง) ใช้ทั้งหน้า /dashboard และ /admin — แต่ละ
// บัญชีกำหนดสิทธิ์เข้าแต่ละหน้าแยกกันได้ (CanAccessDashboard/CanAccessAdmin ใน models.AdminUser)
//
// เก็บ session แบบ in-memory (เหมือน pattern เดียวกับ tabletClients/hardware registry ในไฟล์อื่นของ
// โปรเจกต์นี้) ไม่ใช้ JWT เพื่อเลี่ยงเพิ่ม dependency โดยไม่จำเป็น — ข้อเสียคือ session หายหมดถ้า backend
// restart (ต้อง login ใหม่) ยอมรับได้สำหรับขนาดงานนี้ ไม่ใช่ระบบที่ต้องมี uptime การันตีสูง
type adminSession struct {
	Username  string
	ExpiresAt time.Time
}

var (
	adminSessions   = make(map[string]adminSession)
	adminSessionsMu sync.Mutex
)

const adminSessionCookieName = "admin_session"
const adminSessionTTL = 7 * 24 * time.Hour // 7 วัน

func generateSessionToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// AdminLogin ตรวจ username/password กับตาราง admin_users (bcrypt) แล้วออก session token เก็บไว้ใน
// httpOnly cookie — SameSite=Lax แทนที่จะเป็น Strict เพราะ frontend/backend อยู่คนละพอร์ต (ไม่ใช่คนละ
// "site" ตามนิยามของ cookie spec พอร์ตไม่นับ จึงยังส่ง cookie ข้ามพอร์ตได้ปกติ) ไม่ใส่ Secure เพราะระบบนี้
// รันผ่าน HTTP ธรรมดาบนเครือข่ายภายใน ไม่มี HTTPS
func AdminLogin(c *fiber.Ctx) error {
	type LoginRequest struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	req := new(LoginRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	if req.Username == "" || req.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณากรอก username และ password"})
	}

	var user models.AdminUser
	if err := database.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		// ข้อความเดียวกันไม่ว่าจะ username ผิดหรือ password ผิด กัน enumeration ว่า username ไหนมีจริง
		return c.Status(401).JSON(fiber.Map{"error": "username หรือ password ไม่ถูกต้อง"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "username หรือ password ไม่ถูกต้อง"})
	}

	token, err := generateSessionToken()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "สร้าง session ไม่สำเร็จ"})
	}

	adminSessionsMu.Lock()
	adminSessions[token] = adminSession{Username: user.Username, ExpiresAt: time.Now().Add(adminSessionTTL)}
	adminSessionsMu.Unlock()

	c.Cookie(&fiber.Cookie{
		Name:     adminSessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  time.Now().Add(adminSessionTTL),
		HTTPOnly: true,
		SameSite: "Lax",
	})

	return c.JSON(fiber.Map{"message": "เข้าสู่ระบบสำเร็จ", "username": user.Username})
}

// AdminLogout ลบ session ทั้งฝั่ง server (map) และสั่งเบราว์เซอร์ลบ cookie ทิ้ง
func AdminLogout(c *fiber.Ctx) error {
	token := c.Cookies(adminSessionCookieName)
	if token != "" {
		adminSessionsMu.Lock()
		delete(adminSessions, token)
		adminSessionsMu.Unlock()
	}
	c.Cookie(&fiber.Cookie{
		Name:     adminSessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Now().Add(-time.Hour),
		HTTPOnly: true,
		SameSite: "Lax",
	})
	return c.JSON(fiber.Map{"message": "ออกจากระบบแล้ว"})
}

// AdminMe คืน username + สิทธิ์เข้าหน้าต่างๆ ของคนที่ login อยู่ตอนนี้ (ถ้า login อยู่) — frontend เรียก
// ตอนโหลดหน้า /dashboard และ /admin เพื่อเช็คว่ายัง login ค้างอยู่ไหม และมีสิทธิ์เข้าหน้านั้นหรือไม่
// ก่อนจะโชว์เนื้อหาจริง (เรียกจาก DB สดทุกครั้ง ไม่ cache ไว้ใน session เพื่อให้สิทธิ์ที่แอดมินเพิ่ง
// เปลี่ยนมีผลทันทีโดยไม่ต้อง logout/login ใหม่)
func AdminMe(c *fiber.Ctx) error {
	user, ok := validateAdminSession(c)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"error": "ยังไม่ได้เข้าสู่ระบบ"})
	}
	return c.JSON(fiber.Map{
		"username":             user.Username,
		"can_access_dashboard": user.CanAccessDashboard,
		"can_access_admin":     user.CanAccessAdmin,
		"can_access_simulator": user.CanAccessSimulator,
	})
}

// validateAdminSession เช็ค session token จาก cookie ว่ายังไม่หมดอายุไหม แล้วโหลดข้อมูลผู้ใช้ปัจจุบัน
// จาก DB สดๆ (ไม่ใช่จาก session cache) เพื่อให้สิทธิ์เข้าหน้าต่างๆที่แอดมินแก้ไขมีผลทันที — ใช้ร่วมกันทั้ง
// AdminMe, RequireAdminAuth และ RequireDashboardAccess
func validateAdminSession(c *fiber.Ctx) (*models.AdminUser, bool) {
	token := c.Cookies(adminSessionCookieName)
	if token == "" {
		return nil, false
	}
	adminSessionsMu.Lock()
	sess, ok := adminSessions[token]
	if !ok || time.Now().After(sess.ExpiresAt) {
		if ok {
			delete(adminSessions, token) // เก็บกวาด session หมดอายุไปในตัว
		}
		adminSessionsMu.Unlock()
		return nil, false
	}
	adminSessionsMu.Unlock()

	var user models.AdminUser
	if err := database.DB.Where("username = ?", sess.Username).First(&user).Error; err != nil {
		return nil, false // user ถูกลบไปแล้วหลัง login (เช่นแอดมินลบบัญชีนี้ทิ้ง)
	}
	return &user, true
}

// RequireAdminAuth เป็น middleware ป้องกันเส้นทาง CRUD ที่ใช้โดยหน้า /admin โดยเฉพาะ (books/borrowers/
// borrows/users) — บังคับที่ backend จริงๆ ต่อให้รู้ URL ของ API ตรงๆก็เรียกไม่ได้ถ้าไม่ได้ login หรือ
// ไม่มีสิทธิ์เข้าหน้า Admin (can_access_admin)
func RequireAdminAuth(c *fiber.Ctx) error {
	user, ok := validateAdminSession(c)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"error": "กรุณาเข้าสู่ระบบก่อน"})
	}
	if !user.CanAccessAdmin {
		return c.Status(403).JSON(fiber.Map{"error": "บัญชีนี้ไม่มีสิทธิ์เข้าหน้า Admin"})
	}
	return c.Next()
}

// RequireDashboardAccess เป็น middleware ป้องกันคำสั่งแก้ไขข้อมูลที่ใช้โดยหน้า /dashboard โดยเฉพาะ (ล็อก/
// ปลดล็อกตู้, เปิด/ปิดให้บริการ, ตั้งค่าตู้, ตั้งค่าแจ้งเตือน ฯลฯ) — ไม่ครอบคลุม endpoint มอเตอร์เปิด/ปิด/
// เท เพราะหน้าแท็บเล็ตก็เรียกใช้ตัวเดียวกันตอนทำงานอัตโนมัติ (ไม่ได้ login) จึงต้องเปิดสาธารณะไว้
func RequireDashboardAccess(c *fiber.Ctx) error {
	user, ok := validateAdminSession(c)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"error": "กรุณาเข้าสู่ระบบก่อน"})
	}
	if !user.CanAccessDashboard {
		return c.Status(403).JSON(fiber.Map{"error": "บัญชีนี้ไม่มีสิทธิ์เข้าหน้า Dashboard"})
	}
	return c.Next()
}

// RequireSimulatorAccess เป็น middleware ป้องกันเส้นทางที่ใช้โดยหน้า /simulator (เครื่องมือนักพัฒนา)
// โดยเฉพาะเท่านั้น — ไม่ครอบคลุม /api/simulate/return-book เพราะหน้าแท็บเล็ตจริง (page.tsx) ก็เรียก
// endpoint ชื่อนี้ตอนทำงานจริงตอนไม่ได้เปิด Fast Mode ด้วย (ชื่อ "simulate" ทำให้เข้าใจผิดได้ แต่จริงๆ
// เป็นส่วนของ flow การคืนหนังสือจริง ไม่ใช่ของหน้า simulator)
func RequireSimulatorAccess(c *fiber.Ctx) error {
	user, ok := validateAdminSession(c)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"error": "กรุณาเข้าสู่ระบบก่อน"})
	}
	if !user.CanAccessSimulator {
		return c.Status(403).JSON(fiber.Map{"error": "บัญชีนี้ไม่มีสิทธิ์เข้าหน้า Simulator"})
	}
	return c.Next()
}

// ----- จัดการบัญชีผู้ใช้ (เพิ่ม/ลบ/ดูรายชื่อ) — ใช้โดยหน้า "จัดการบัญชีผู้ใช้" ใน /admin เท่านั้น
// ต้อง login อยู่แล้วถึงจะเรียกได้ (RequireAdminAuth) ไม่ส่ง password_hash ออกไปเด็ดขาด (ดู json:"-"
// ที่ models.AdminUser)

// AdminListUsers คืนรายชื่อบัญชีผู้ใช้ทั้งหมด (ไม่รวมรหัสผ่าน) เรียงตามวันที่สร้างล่าสุดก่อน
func AdminListUsers(c *fiber.Ctx) error {
	var users []models.AdminUser
	database.DB.Order("id desc").Find(&users)
	return c.JSON(fiber.Map{"users": users})
}

// AdminCreateUser เพิ่มบัญชีผู้ใช้ใหม่ — username ต้องไม่ซ้ำ (unique index กันซ้ำที่ชั้น DB อยู่แล้ว)
// can_access_dashboard/can_access_admin เป็น *bool เพื่อแยกแยะ "ไม่ได้ส่งมา" (nil → default true ทั้งคู่)
// กับ "ส่งมาเป็น false" ตั้งใจ (เช่น สร้างบัญชีที่เข้าได้แค่หน้า Dashboard ไม่ให้เข้า Admin)
func AdminCreateUser(c *fiber.Ctx) error {
	type CreateUserRequest struct {
		Username           string `json:"username"`
		Password           string `json:"password"`
		CanAccessDashboard *bool  `json:"can_access_dashboard"`
		CanAccessAdmin     *bool  `json:"can_access_admin"`
		CanAccessSimulator *bool  `json:"can_access_simulator"`
	}
	req := new(CreateUserRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณากรอก username และ password"})
	}
	if len(req.Password) < 8 {
		return c.Status(400).JSON(fiber.Map{"error": "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร"})
	}

	var count int64
	database.DB.Model(&models.AdminUser{}).Where("username = ?", req.Username).Count(&count)
	if count > 0 {
		return c.Status(409).JSON(fiber.Map{"error": "มี username นี้อยู่แล้ว"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "สร้างบัญชีไม่สำเร็จ"})
	}

	// สร้างด้วยค่า default (true/true) ก่อนเสมอ แล้วค่อย Update ทีละฟิลด์ทับถ้าต้องการ false — เลี่ยงบั๊ก
	// ของ GORM ที่ Create() จะ "มองไม่เห็น" ฟิลด์ bool ที่มี tag `default` แล้วค่าที่ส่งมาตรงกับ zero value
	// ของ Go (false) พอดี (ตั้งใจ false ของเราหรือแค่ไม่ได้ตั้งมันแยกไม่ได้ที่ชั้น Create) ทำให้ Create
	// ปล่อยให้ DB default (true) เข้ามาแทนเสมอ ไม่ว่าจะส่ง false มาจริงๆหรือไม่ — Update ไม่มีปัญหานี้
	user := models.AdminUser{Username: req.Username, PasswordHash: string(hash)}
	database.DB.Create(&user)

	if req.CanAccessDashboard != nil && !*req.CanAccessDashboard {
		database.DB.Model(&user).Update("can_access_dashboard", false)
		user.CanAccessDashboard = false
	}
	if req.CanAccessAdmin != nil && !*req.CanAccessAdmin {
		database.DB.Model(&user).Update("can_access_admin", false)
		user.CanAccessAdmin = false
	}
	if req.CanAccessSimulator != nil && !*req.CanAccessSimulator {
		database.DB.Model(&user).Update("can_access_simulator", false)
		user.CanAccessSimulator = false
	}

	return c.JSON(fiber.Map{"message": "เพิ่มบัญชีผู้ใช้สำเร็จ", "id": user.ID, "username": user.Username})
}

// AdminUpdateUser แก้ไขสิทธิ์เข้าหน้าต่างๆ ของบัญชีผู้ใช้ที่มีอยู่ (และเปลี่ยนรหัสผ่านได้ถ้าส่ง password
// มาด้วย) — ห้ามถอดสิทธิ์ can_access_admin ออกจากบัญชีสุดท้ายที่ยังมีสิทธิ์นี้อยู่ ไม่งั้นจะไม่มีใคร
// เข้าหน้า Admin มาจัดการบัญชีผู้ใช้ได้อีกเลย (ต้องไปแก้ตรงๆผ่าน SQL ถึงจะกู้กลับมาได้)
func AdminUpdateUser(c *fiber.Ctx) error {
	id := c.Params("id")
	type UpdateUserRequest struct {
		Password           string `json:"password"`
		CanAccessDashboard *bool  `json:"can_access_dashboard"`
		CanAccessAdmin     *bool  `json:"can_access_admin"`
		CanAccessSimulator *bool  `json:"can_access_simulator"`
	}
	req := new(UpdateUserRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	var user models.AdminUser
	if err := database.DB.First(&user, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบบัญชีนี้"})
	}

	if req.CanAccessAdmin != nil && !*req.CanAccessAdmin && user.CanAccessAdmin {
		var adminCount int64
		database.DB.Model(&models.AdminUser{}).Where("can_access_admin = ?", true).Count(&adminCount)
		if adminCount <= 1 {
			return c.Status(400).JSON(fiber.Map{"error": "ถอดสิทธิ์ไม่ได้ — ต้องเหลืออย่างน้อย 1 บัญชีที่เข้าหน้า Admin ได้เสมอ"})
		}
		user.CanAccessAdmin = false
	} else if req.CanAccessAdmin != nil {
		user.CanAccessAdmin = *req.CanAccessAdmin
	}

	if req.CanAccessDashboard != nil {
		user.CanAccessDashboard = *req.CanAccessDashboard
	}

	if req.CanAccessSimulator != nil {
		user.CanAccessSimulator = *req.CanAccessSimulator
	}

	if req.Password != "" {
		if len(req.Password) < 8 {
			return c.Status(400).JSON(fiber.Map{"error": "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร"})
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "เปลี่ยนรหัสผ่านไม่สำเร็จ"})
		}
		user.PasswordHash = string(hash)
	}

	database.DB.Save(&user)
	return c.JSON(fiber.Map{
		"message": "บันทึกสำเร็จ", "id": user.ID, "username": user.Username,
		"can_access_dashboard": user.CanAccessDashboard, "can_access_admin": user.CanAccessAdmin,
		"can_access_simulator": user.CanAccessSimulator,
	})
}

// AdminDeleteUser ลบบัญชีผู้ใช้ — ห้ามลบจนไม่เหลือ user เลยสักคน กันทุกคนถูกล็อกออกจากระบบถาวร (ต้องไป
// insert ใหม่ด้วยมือผ่าน SQL ถึงจะกู้กลับมาได้) และห้ามลบบัญชีสุดท้ายที่ยังมีสิทธิ์ can_access_admin อยู่
// ด้วยเหตุผลเดียวกับ AdminUpdateUser ไม่ได้บล็อกการลบบัญชีตัวเอง (เจตนา — ถ้ายังมี user คนอื่นเหลืออยู่
// ลบตัวเองได้ปกติ แค่ session ปัจจุบันจะยังใช้ต่อได้จนกว่าจะ logout/หมดอายุ เพราะ session แยกจากข้อมูล
// user ใน DB)
func AdminDeleteUser(c *fiber.Ctx) error {
	id := c.Params("id")

	var total int64
	database.DB.Model(&models.AdminUser{}).Count(&total)
	if total <= 1 {
		return c.Status(400).JSON(fiber.Map{"error": "ลบไม่ได้ — ต้องเหลืออย่างน้อย 1 บัญชีในระบบเสมอ"})
	}

	var target models.AdminUser
	if err := database.DB.First(&target, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบบัญชีนี้"})
	}
	if target.CanAccessAdmin {
		var adminCount int64
		database.DB.Model(&models.AdminUser{}).Where("can_access_admin = ?", true).Count(&adminCount)
		if adminCount <= 1 {
			return c.Status(400).JSON(fiber.Map{"error": "ลบไม่ได้ — ต้องเหลืออย่างน้อย 1 บัญชีที่เข้าหน้า Admin ได้เสมอ"})
		}
	}

	if result := database.DB.Delete(&models.AdminUser{}, id); result.RowsAffected == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบบัญชีนี้"})
	}
	return c.JSON(fiber.Map{"message": "ลบบัญชีผู้ใช้สำเร็จ"})
}
