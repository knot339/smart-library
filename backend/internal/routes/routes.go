package routes

import (
	"smart-library-api/internal/handlers"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

func Setup(app *fiber.App) {
	// เส้นทางสำหรับการเชื่อมต่อ WebSocket ของอุปกรณ์แท็บเล็ต
	app.Get("/ws/tablet", websocket.New(handlers.TabletWS))

	// เส้นทางสำหรับการรับข้อมูลจากระบบจำลอง (Simulator) — หน้า /simulator เท่านั้นที่เรียกใช้ จึงบังคับ
	// สิทธิ์ can_access_simulator ไว้
	app.Post("/api/simulator/send", handlers.RequireSimulatorAccess, handlers.SimulatorSend)

	// เส้นทางสำหรับการเชื่อมต่อ WebSocket ของอุปกรณ์ ESP32 ถูกเปลี่ยนไปใช้ MQTT แล้ว

	// เส้นทาง API สำหรับระบบจำลองการทำงานของฮาร์ดแวร์ — /api/status, /simulate/reset, /fast-mode,
	// /force-empty เป็นของหน้า /simulator โดยเฉพาะ บังคับสิทธิ์ไว้เหมือนกัน ยกเว้น /simulate/return-book
	// ที่หน้าแท็บเล็ตจริง (ไม่ได้ login) ก็เรียกใช้ตอนทำงานจริงด้วย (ชื่อ endpoint ทำให้เข้าใจผิดได้ว่าเป็น
	// ของจำลองอย่างเดียว) จึงเปิดสาธารณะไว้
	app.Get("/api/status", handlers.RequireSimulatorAccess, handlers.GetStatus)
	app.Post("/api/simulate/return-book", handlers.SimulateReturnBook)
	app.Post("/api/simulate/reset", handlers.RequireSimulatorAccess, handlers.SimulateReset)
	app.Post("/api/simulate/fast-mode", handlers.RequireSimulatorAccess, handlers.SetFastMode)
	app.Post("/api/simulate/force-empty", handlers.RequireSimulatorAccess, handlers.SetForceEmpty)

	// เส้นทาง API สำหรับระบบกระดานควบคุม (Dashboard) — ยังไม่ระบุตู้ ผูกกับตู้เริ่มต้นเสมอ (ดู
	// resolveCabinetID) เก็บไว้ให้ frontend เดิม (ยังไม่รู้จัก cabinet_id) ใช้งานต่อได้ระหว่างทำระบบ
	// หลายตู้ — ของใหม่ที่รองรับหลายตู้จริงอยู่ด้านล่าง (/api/dashboard/cabinet/:id/...) — เส้นทางชุดนี้
	// (ไม่มี :id) ไม่ได้บังคับ login เพิ่ม เพราะเป็นของเก่าที่ไม่มี frontend ไหนเรียกใช้แล้ว (เหลือไว้เผื่อ
	// ความเข้ากันได้) ของจริงที่หน้า Dashboard ใช้อยู่คือชุด :id ด้านล่าง ยกเว้น set-full ที่หน้า /simulator
	// ยังเรียกใช้ตัวนี้อยู่จริงๆ (ไม่มี :id) จึงบังคับสิทธิ์ can_access_simulator ไว้
	app.Get("/api/dashboard/cabinet", handlers.GetCabinetStatus)
	app.Post("/api/dashboard/motor/open", handlers.OpenMotor)
	app.Post("/api/dashboard/motor/close", handlers.CloseMotor)
	app.Post("/api/dashboard/motor/dump", handlers.DumpMotor)
	app.Post("/api/dashboard/cabinet/lock", handlers.SetCabinetLock)
	app.Post("/api/dashboard/cabinet/set-full", handlers.RequireSimulatorAccess, handlers.SetCabinetFull)
	app.Get("/api/dashboard/books-in-cabinet", handlers.GetBooksInCabinet)
	app.Get("/api/dashboard/recent-returns", handlers.GetRecentReturns)
	app.Post("/api/dashboard/cabinet/reset", handlers.ResetCabinet)

	// เส้นทางเดียวกันข้างบน แต่ระบุตู้ได้จริงผ่าน :id (ใช้ handler ตัวเดียวกัน — resolveCabinetID
	// อ่าน :id จาก path นี้ได้อัตโนมัติ) สำหรับระบบหลายตู้ — ของจริงที่หน้า Dashboard เรียกใช้
	//
	// มอเตอร์เปิด/ปิด/เท **ไม่ใส่ RequireDashboardAccess** เพราะหน้าแท็บเล็ต (ไม่ได้ login) ก็เรียก
	// endpoint ชุดเดียวกันนี้ตอนทำงานอัตโนมัติด้วย (ดู frontend/src/app/page.tsx) ส่วนคำสั่งที่เหลือ
	// เป็นของหน้า Dashboard โดยเฉพาะ (ไม่มีหน้าไหนอื่นเรียกใช้) จึงบังคับ login + สิทธิ์ can_access_dashboard
	app.Get("/api/dashboard/cabinet/:id", handlers.GetCabinetStatus)
	app.Post("/api/dashboard/cabinet/:id/motor/open", handlers.OpenMotor)
	app.Post("/api/dashboard/cabinet/:id/motor/close", handlers.CloseMotor)
	app.Post("/api/dashboard/cabinet/:id/motor/dump", handlers.DumpMotor)
	app.Post("/api/dashboard/cabinet/:id/lock", handlers.RequireDashboardAccess, handlers.SetCabinetLock)
	app.Post("/api/dashboard/cabinet/:id/set-full", handlers.RequireDashboardAccess, handlers.SetCabinetFull)
	app.Post("/api/dashboard/cabinet/:id/reset", handlers.RequireDashboardAccess, handlers.ResetCabinet)
	app.Post("/api/dashboard/cabinet/:id/reset-tablet", handlers.RequireDashboardAccess, handlers.ResetTabletSetup)

	// เส้นทาง API สำหรับจัดการกองเรือตู้ (หลายตู้) — รายชื่อตู้ทั้งหมด, เปิด/ปิดให้บริการทีละตู้,
	// กล้องลงทะเบียนตัวเอง
	app.Get("/api/cabinets", handlers.GetCabinets)
	app.Get("/api/cabinets/:id", handlers.GetCabinetDetail)
	app.Post("/api/cabinets/:id/:state", handlers.RequireDashboardAccess, handlers.SetCabinetActive)
	app.Post("/api/cabinets/register-camera", handlers.RegisterCabinetCamera)
	app.Get("/api/dashboard/system-settings", handlers.GetSystemSettings)
	app.Post("/api/dashboard/system-settings", handlers.RequireDashboardAccess, handlers.SetSystemSettings)
	app.Get("/api/dashboard/notify-email", handlers.GetNotifyEmail)
	app.Post("/api/dashboard/notify-email", handlers.RequireDashboardAccess, handlers.SetNotifyEmail)
	app.Get("/api/dashboard/notify-line", handlers.GetNotifyLine)
	app.Post("/api/dashboard/notify-line", handlers.RequireDashboardAccess, handlers.CreateNotifyLineChannel)
	app.Put("/api/dashboard/notify-line/:id", handlers.RequireDashboardAccess, handlers.UpdateNotifyLineChannel)
	app.Delete("/api/dashboard/notify-line/:id", handlers.RequireDashboardAccess, handlers.DeleteNotifyLineChannel)
	app.Post("/api/line/webhook", handlers.LineWebhook)

	// เส้นทาง API สำหรับการสืบค้นข้อมูล
	app.Get("/api/borrower/code/:code", handlers.FindBorrowerByCode)
	app.Get("/api/book/barcode/:barcode", handlers.FindBookByBarcode)
	app.Get("/api/patron/:barcode/borrows", handlers.GetPatronBorrow)
	app.Get("/api/bibinfo/:bibid", handlers.GetBibInfo)
	app.Post("/api/borrows/return", handlers.ReturnByBorrowerAndBook)
	app.Post("/api/borrows/return-failed", handlers.ReturnFailed)

	// เส้นทาง API สำหรับระบบ login เดียวของทั้งระบบ (user/รหัสผ่านแยกรายคนจริง) ใช้ทั้งหน้า /dashboard
	// และ /admin — แต่ละบัญชีมีสิทธิ์เข้าแต่ละหน้าแยกกันได้ (ดู /api/auth/users ด้านล่าง)
	app.Post("/api/auth/login", handlers.AdminLogin)
	app.Post("/api/auth/logout", handlers.AdminLogout)
	app.Get("/api/auth/me", handlers.AdminMe)

	// จัดการบัญชีผู้ใช้ + สิทธิ์เข้าหน้าต่างๆ (หน้า "จัดการบัญชีผู้ใช้" ใน /admin) — ต้องมีสิทธิ์
	// can_access_admin ถึงจะเรียกได้ (RequireAdminAuth เช็คให้)
	app.Get("/api/auth/users", handlers.RequireAdminAuth, handlers.AdminListUsers)
	app.Post("/api/auth/users", handlers.RequireAdminAuth, handlers.AdminCreateUser)
	app.Put("/api/auth/users/:id", handlers.RequireAdminAuth, handlers.AdminUpdateUser)
	app.Delete("/api/auth/users/:id", handlers.RequireAdminAuth, handlers.AdminDeleteUser)

	// เส้นทาง API สำหรับจัดการข้อมูลหนังสือ (CRUD) — เฉพาะคำสั่งแก้ไขข้อมูล (เพิ่ม/แก้/ลบ) ต้อง login
	// ผ่าน /api/auth/login ก่อน (RequireAdminAuth บังคับที่ backend จริงๆ ไม่ใช่แค่ซ่อนปุ่มฝั่งหน้าเว็บ)
	// ส่วน GET (อ่านอย่างเดียว) เปิดสาธารณะไว้เหมือนเดิม เพราะหน้า Dashboard ก็ดึงไปแสดงบางส่วนด้วย
	app.Get("/api/books", handlers.GetBooks)
	app.Post("/api/books", handlers.RequireAdminAuth, handlers.CreateBook)
	app.Put("/api/books/:id", handlers.RequireAdminAuth, handlers.UpdateBook)
	app.Delete("/api/books/:id", handlers.RequireAdminAuth, handlers.DeleteBook)

	// เส้นทาง API สำหรับจัดการข้อมูลผู้ใช้งาน (CRUD) — เฉพาะคำสั่งแก้ไขข้อมูลต้อง login เช่นกัน
	app.Get("/api/borrowers", handlers.GetBorrowers)
	app.Post("/api/borrowers", handlers.RequireAdminAuth, handlers.CreateBorrower)
	app.Put("/api/borrowers/:id", handlers.RequireAdminAuth, handlers.UpdateBorrower)
	app.Delete("/api/borrowers/:id", handlers.RequireAdminAuth, handlers.DeleteBorrower)

	// เส้นทาง API สำหรับจัดการข้อมูลบันทึกการยืม-คืน — เฉพาะคำสั่งแก้ไขข้อมูลต้อง login (คนละชุดกับ
	// /api/borrows/return, /api/borrows/return-failed ด้านบนที่ตู้/แท็บเล็ตสาธารณะใช้ ไม่ต้อง login)
	// GET เปิดสาธารณะไว้ เพราะหน้า Dashboard ก็ดึงรายการ "คืนผิดพลาด" จากเส้นทางนี้ด้วย
	app.Get("/api/borrows", handlers.GetBorrowRecords)
	app.Post("/api/borrows", handlers.RequireAdminAuth, handlers.CreateBorrowRecord)
	app.Put("/api/borrows/:id/return", handlers.RequireAdminAuth, handlers.ReturnBook)
	app.Delete("/api/borrows/:id", handlers.RequireAdminAuth, handlers.DeleteBorrowRecord)
}
