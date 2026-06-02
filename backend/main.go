package main

import (
	"smart-library-api/database"
	"smart-library-api/handlers"
	"smart-library-api/hardware"
	"smart-library-api/models"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/websocket/v2"
)

func main() {
	database.Connect()

	app := fiber.New()
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,PUT,DELETE",
		AllowHeaders: "Origin, Content-Type, Accept",
	}))

	hw := hardware.NewMockHardware()

	// WebSocket — Tablet เชื่อมต่อที่นี่
	app.Get("/ws/tablet", websocket.New(handlers.TabletWS))

	// Simulator ส่งค่าจำลองมาที่นี่
	app.Post("/api/simulator/send", handlers.SimulatorSend)

	// ESP32 WebSocket endpoint
	app.Get("/ws/esp32", websocket.New(handlers.ESP32WS))

	// Hardware simulation
	app.Get("/api/status", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"capacity":     hw.Capacity,
			"is_full":      hw.IsFull,
			"motor_status": hw.MotorStatus,
			"motor_logs":   hw.MotorLogs,
			"status":       "Ready",
		})
	})
	app.Post("/api/simulate/return-book", func(c *fiber.Ctx) error {
		newCapacity := hw.AddBook()
		return c.JSON(fiber.Map{"message": "รับคืนหนังสือสำเร็จ", "capacity": newCapacity})
	})
	app.Post("/api/simulate/reset", func(c *fiber.Ctx) error {
		hw.Capacity = 0
		return c.JSON(fiber.Map{"message": "รีเซ็ตตู้แล้ว", "capacity": 0})
	})

	// Dashboard API
	app.Get("/api/dashboard/cabinet", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"capacity":     hw.Capacity,
			"is_full":      hw.IsFull,
			"motor_status": hw.MotorStatus,
			"status":       "online",
		})
	})

	// เปิดรับหนังสือ (แกนชักหดบางส่วน)
	app.Post("/api/dashboard/motor/open", func(c *fiber.Ctx) error {
		hw.SetOpen()
		return c.JSON(fiber.Map{
			"message":      "เปิดรับหนังสือแล้ว",
			"motor_status": hw.MotorStatus,
		})
	})

	// ปิด (แกนชักยืดสุด)
	app.Post("/api/dashboard/motor/close", func(c *fiber.Ctx) error {
		hw.SetClosed()
		return c.JSON(fiber.Map{
			"message":      "ปิดตู้แล้ว",
			"motor_status": hw.MotorStatus,
		})
	})

	// เท (แกนชักหดสุด)
	app.Post("/api/dashboard/motor/dump", func(c *fiber.Ctx) error {
		hw.SetDump()
		return c.JSON(fiber.Map{
			"message":      "เทหนังสือลงเก็บแล้ว",
			"motor_status": hw.MotorStatus,
		})
	})

	// ตั้งค่าสถานะตู้เต็ม/ไม่เต็ม
	app.Post("/api/dashboard/cabinet/set-full", func(c *fiber.Ctx) error {
		type SetFullRequest struct {
			IsFull bool `json:"is_full"`
		}
		req := new(SetFullRequest)
		if err := c.BodyParser(req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
		}
		hw.SetFull(req.IsFull)
		return c.JSON(fiber.Map{
			"message": "ตั้งค่าสถานะตู้สำเร็จ",
			"is_full": hw.IsFull,
		})
	})

	app.Get("/api/dashboard/books-in-cabinet", func(c *fiber.Ctx) error {
		var records []models.BorrowRecord
		database.DB.Preload("Book").Preload("Borrower").
			Where("status = ? AND returned_at IS NOT NULL", "returned").
			Order("returned_at DESC").
			Find(&records)

		bookMap := make(map[uint]fiber.Map)
		for _, r := range records {
			if _, exists := bookMap[r.BookID]; !exists {
				bookMap[r.BookID] = fiber.Map{
					"id":          r.Book.ID,
					"title":       r.Book.Title,
					"author":      r.Book.Author,
					"isbn":        r.Book.ISBN,
					"returned_at": r.ReturnedAt,
					"returned_by": r.Borrower.Name,
				}
			}
		}

		books := make([]fiber.Map, 0, len(bookMap))
		for _, b := range bookMap {
			books = append(books, b)
		}
		return c.JSON(fiber.Map{"count": len(books), "books": books})
	})

	app.Get("/api/dashboard/recent-returns", func(c *fiber.Ctx) error {
		var records []models.BorrowRecord
		database.DB.Preload("Book").Preload("Borrower").
			Where("status = ?", "returned").
			Order("returned_at DESC").
			Limit(20).
			Find(&records)
		return c.JSON(records)
	})

	// รีเซ็ตรายการหนังสือในตู้ (หลังเก็บหนังสือออกแล้ว)
	app.Post("/api/dashboard/cabinet/reset", func(c *fiber.Ctx) error {
		// รีเซ็ตความจุตู้กลับเป็น 0
		hw.Capacity = 0
		hw.SetClosed()

		// ลบประวัติ returned ทั้งหมดออกจาก DB
		// (หรือจะ mark ว่า "collected" แทนการลบก็ได้)
		database.DB.Where("status = ?", "returned").
			Delete(&models.BorrowRecord{})

		return c.JSON(fiber.Map{
			"message":      "รีเซ็ตรายการในตู้สำเร็จ",
			"motor_status": hw.MotorStatus,
		})
	})

	// Lookup APIs
	app.Get("/api/borrower/code/:code", handlers.FindBorrowerByCode)
	app.Get("/api/book/isbn/:isbn", handlers.FindBookByISBN)
	app.Get("/api/borrows/active/:borrower_id", handlers.GetActiveBorrows)
	app.Post("/api/borrows/return", handlers.ReturnByBorrowerAndBook)

	// Books CRUD
	app.Get("/api/books", handlers.GetBooks)
	app.Post("/api/books", handlers.CreateBook)
	app.Put("/api/books/:id", handlers.UpdateBook)
	app.Delete("/api/books/:id", handlers.DeleteBook)

	// Borrowers CRUD
	app.Get("/api/borrowers", handlers.GetBorrowers)
	app.Post("/api/borrowers", handlers.CreateBorrower)
	app.Put("/api/borrowers/:id", handlers.UpdateBorrower)
	app.Delete("/api/borrowers/:id", handlers.DeleteBorrower)

	// Borrow Records
	app.Get("/api/borrows", handlers.GetBorrowRecords)
	app.Post("/api/borrows", handlers.CreateBorrowRecord)
	app.Put("/api/borrows/:id/return", handlers.ReturnBook)
	app.Delete("/api/borrows/:id", handlers.DeleteBorrowRecord)

	app.Listen(":8080")
}
