package main

import (
	"smart-library-api/internal/database"
	"smart-library-api/internal/handlers"
	"smart-library-api/internal/hardware"
	"smart-library-api/internal/routes"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func main() {
	database.Connect()
	handlers.InitMQTT()

	// ผูกระบบแจ้งเตือนอีเมลเข้ากับ hardware ตรงนี้ (ไม่ผูกตรงๆ ใน package hardware เพื่อไม่ให้
	// package นั้นต้องรู้จัก database/SMTP เลย) จะถูกเรียกอัตโนมัติทุกครั้งที่ตู้เพิ่งเต็ม
	hardware.OnCabinetBecameFull = handlers.SendCabinetFullNotification

	app := fiber.New()
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,PUT,DELETE",
		AllowHeaders: "Origin, Content-Type, Accept",
	}))

	routes.Setup(app)

	app.Listen(":8080")
}
