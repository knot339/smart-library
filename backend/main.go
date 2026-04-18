package main

import (
	"smart-library-api/database"
	"smart-library-api/handlers"
	"smart-library-api/hardware"

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
		AllowHeaders: "Content-Type",
	}))

	hw := hardware.NewMockHardware()

	// WebSocket — Tablet เชื่อมต่อที่นี่
	app.Get("/ws/tablet", websocket.New(handlers.TabletWS))

	// Simulator ส่งค่าจำลองมาที่นี่
	app.Post("/api/simulator/send", handlers.SimulatorSend)

	// Hardware simulation
	app.Get("/api/status", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"capacity": hw.Capacity, "status": "Ready"})
	})
	app.Post("/api/simulate/return-book", func(c *fiber.Ctx) error {
		hw.OpenMotor()
		newCapacity := hw.AddBook()
		hw.CloseMotor()
		return c.JSON(fiber.Map{"message": "รับคืนหนังสือสำเร็จ", "capacity": newCapacity})
	})
	app.Post("/api/simulate/reset", func(c *fiber.Ctx) error {
		hw.Capacity = 0
		return c.JSON(fiber.Map{"message": "รีเซ็ตตู้แล้ว", "capacity": 0})
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