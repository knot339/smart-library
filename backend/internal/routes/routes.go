package routes

import (
	"smart-library-api/internal/handlers"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

func Setup(app *fiber.App) {
	// เส้นทางสำหรับการเชื่อมต่อ WebSocket ของอุปกรณ์แท็บเล็ต
	app.Get("/ws/tablet", websocket.New(handlers.TabletWS))

	// เส้นทางสำหรับการรับข้อมูลจากระบบจำลอง (Simulator)
	app.Post("/api/simulator/send", handlers.SimulatorSend)

	// เส้นทางสำหรับการเชื่อมต่อ WebSocket ของอุปกรณ์ ESP32
	app.Get("/ws/esp32", websocket.New(handlers.ESP32WS))

	// เส้นทาง API สำหรับระบบจำลองการทำงานของฮาร์ดแวร์
	app.Get("/api/status", handlers.GetStatus)
	app.Post("/api/simulate/return-book", handlers.SimulateReturnBook)
	app.Post("/api/simulate/reset", handlers.SimulateReset)

	// เส้นทาง API สำหรับระบบกระดานควบคุม (Dashboard)
	app.Get("/api/dashboard/cabinet", handlers.GetCabinetStatus)
	app.Post("/api/dashboard/motor/open", handlers.OpenMotor)
	app.Post("/api/dashboard/motor/close", handlers.CloseMotor)
	app.Post("/api/dashboard/motor/dump", handlers.DumpMotor)
	app.Post("/api/dashboard/cabinet/set-full", handlers.SetCabinetFull)
	app.Get("/api/dashboard/books-in-cabinet", handlers.GetBooksInCabinet)
	app.Get("/api/dashboard/recent-returns", handlers.GetRecentReturns)
	app.Post("/api/dashboard/cabinet/reset", handlers.ResetCabinet)

	// เส้นทาง API สำหรับการสืบค้นข้อมูล
	app.Get("/api/borrower/code/:code", handlers.FindBorrowerByCode)
	app.Get("/api/book/barcode/:barcode", handlers.FindBookByBarcode)
	app.Get("/api/patron/:barcode/borrows", handlers.GetPatronBorrow)
	app.Get("/api/bibinfo/:bibid", handlers.GetBibInfo)
	app.Post("/api/borrows/return", handlers.ReturnByBorrowerAndBook)

	// เส้นทาง API สำหรับจัดการข้อมูลหนังสือ (CRUD)
	app.Get("/api/books", handlers.GetBooks)
	app.Post("/api/books", handlers.CreateBook)
	app.Put("/api/books/:id", handlers.UpdateBook)
	app.Delete("/api/books/:id", handlers.DeleteBook)

	// เส้นทาง API สำหรับจัดการข้อมูลผู้ใช้งาน (CRUD)
	app.Get("/api/borrowers", handlers.GetBorrowers)
	app.Post("/api/borrowers", handlers.CreateBorrower)
	app.Put("/api/borrowers/:id", handlers.UpdateBorrower)
	app.Delete("/api/borrowers/:id", handlers.DeleteBorrower)

	// เส้นทาง API สำหรับจัดการข้อมูลบันทึกการยืม-คืน
	app.Get("/api/borrows", handlers.GetBorrowRecords)
	app.Post("/api/borrows", handlers.CreateBorrowRecord)
	app.Put("/api/borrows/:id/return", handlers.ReturnBook)
	app.Delete("/api/borrows/:id", handlers.DeleteBorrowRecord)
}
