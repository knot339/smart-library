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
	// AllowOrigins: "*" ใช้คู่กับ AllowCredentials: true ไม่ได้ (spec ของเบราว์เซอร์ห้ามไว้ — ต้องระบุ
	// origin จริงเท่านั้นถ้าจะส่ง cookie ข้าม origin ได้) ระบบ login แบบที่ 2 ของหน้า /admin ต้องพึ่ง
	// cookie ข้าม origin นี้ (frontend พอร์ต 3000, backend พอร์ต 8080 คนละ origin กันตามนิยาม CORS แม้จะ
	// อยู่เครื่อง/โดเมนเดียวกันก็ตาม) จึงสะท้อน origin ของ request กลับไปตรงๆแทน "*" เพื่อให้ยังใช้ได้จาก
	// IP ของเครื่อง server ที่เปลี่ยนได้เอง (hotspot) โดยไม่ต้อง hardcode origin ไว้ล่วงหน้า
	app.Use(cors.New(cors.Config{
		AllowOriginsFunc: func(origin string) bool { return true },
		AllowMethods:     "GET,POST,PUT,DELETE",
		AllowHeaders:     "Origin, Content-Type, Accept",
		AllowCredentials: true,
	}))

	routes.Setup(app)

	app.Listen(":8080")
}
