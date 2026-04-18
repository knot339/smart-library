package handlers

import (
	"smart-library-api/database"
	"smart-library-api/models"

	"github.com/gofiber/fiber/v2"
)

func GetBorrowers(c *fiber.Ctx) error {
	var borrowers []models.Borrower
	database.DB.Find(&borrowers)
	return c.JSON(borrowers)
}

func CreateBorrower(c *fiber.Ctx) error {
	borrower := new(models.Borrower)
	if err := c.BodyParser(borrower); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	result := database.DB.Create(borrower)
	if result.Error != nil {
		return c.Status(500).JSON(fiber.Map{"error": result.Error.Error()})
	}
	return c.Status(201).JSON(borrower)
}

func UpdateBorrower(c *fiber.Ctx) error {
	id := c.Params("id")
	var borrower models.Borrower
	if err := database.DB.First(&borrower, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบผู้ยืม"})
	}
	if err := c.BodyParser(&borrower); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	database.DB.Save(&borrower)
	return c.JSON(borrower)
}

func DeleteBorrower(c *fiber.Ctx) error {
	id := c.Params("id")
	database.DB.Delete(&models.Borrower{}, id)
	return c.JSON(fiber.Map{"message": "ลบผู้ยืมสำเร็จ"})
}