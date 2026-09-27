// เครื่องมือนำเข้ารายการหนังสือจากไฟล์ Excel รายงาน ITEM ของห้องสมุด (คอลัมน์: BARCODE, BIBID, CALLNO,
// TITLE, AUTHOR, ITEMCLASSNAME, ...) เข้าสู่ตาราง books ในฐานข้อมูลของระบบ ใช้ตอนตั้งค่าฐานข้อมูลใหม่
// หรือรีเฟรชข้อมูลหนังสือให้ตรงกับรายงานล่าสุดจากห้องสมุด
//
// วิธีใช้:
//
//	go run ./cmd/importbooks "path/to/รายงานรายการทรัพยากรทั้งหมด (ITEM).xlsx"
//
// ต้องตั้งค่า environment variables เดียวกับตอนรัน backend (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT)
package main

import (
	"fmt"
	"log"
	"os"

	"smart-library-api/internal/database"
	"smart-library-api/internal/models"

	"github.com/xuri/excelize/v2"
	"gorm.io/gorm/clause"
)

const batchSize = 500

func main() {
	if len(os.Args) < 2 {
		log.Fatal("วิธีใช้: go run ./cmd/importbooks <path-to-xlsx>")
	}
	path := os.Args[1]

	f, err := excelize.OpenFile(path)
	if err != nil {
		log.Fatalf("ไม่สามารถเปิดไฟล์ได้: %v", err)
	}
	defer f.Close()

	sheet := f.GetSheetList()[0]
	rows, err := f.Rows(sheet)
	if err != nil {
		log.Fatalf("ไม่สามารถอ่านชีต %q ได้: %v", sheet, err)
	}

	database.Connect()

	// หาแถวหัวตาราง (แถวที่มีคำว่า "BARCODE" อยู่) แล้วจดตำแหน่งคอลัมน์ที่ต้องใช้ไว้
	col := map[string]int{}
	headerFound := false

	batch := make([]models.Book, 0, batchSize)
	var totalRead, imported, skippedNoBarcode int

	flush := func() {
		if len(batch) == 0 {
			return
		}
		result := database.DB.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "barcode"}},
			DoUpdates: clause.AssignmentColumns([]string{"bib_id", "call_no", "title", "author", "category"}),
		}).CreateInBatches(&batch, batchSize)
		if result.Error != nil {
			log.Printf("เพิ่มข้อมูลชุดนี้ไม่สำเร็จ: %v", result.Error)
		} else {
			imported += len(batch)
		}
		batch = batch[:0]
	}

	for rows.Next() {
		cells, err := rows.Columns()
		if err != nil {
			continue
		}

		if !headerFound {
			for i, c := range cells {
				if c == "BARCODE" {
					headerFound = true
				}
				col[c] = i
			}
			continue // แถวนี้คือ header เอง ไม่ใช่ข้อมูล
		}

		get := func(name string) string {
			i, ok := col[name]
			if !ok || i >= len(cells) {
				return ""
			}
			return cells[i]
		}

		barcode := get("BARCODE")
		if barcode == "" {
			skippedNoBarcode++
			continue
		}
		totalRead++

		batch = append(batch, models.Book{
			Barcode:  barcode,
			BibID:    get("BIBID"),
			CallNo:   get("CALLNO"),
			Title:    get("TITLE"),
			Author:   get("AUTHOR"),
			Category: get("ITEMCLASSNAME"),
			Stock:    1,
		})

		if len(batch) >= batchSize {
			flush()
		}
	}
	flush()

	fmt.Printf("นำเข้าเสร็จสิ้น: อ่านได้ %d รายการ, บันทึกสำเร็จ %d รายการ, ข้าม (ไม่มี Barcode) %d รายการ\n",
		totalRead, imported, skippedNoBarcode)
}
