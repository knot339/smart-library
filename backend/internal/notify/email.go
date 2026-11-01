package notify

import (
	"fmt"
	htmlpkg "html"
	"mime"
	"net/smtp"
	"os"
	"strings"
)

// หนังสือ 1 เล่มที่อยู่ในตู้ขณะที่ตู้เต็ม ใช้แสดงเป็นแถวในตารางของอีเมลแจ้งเตือน
type CabinetBookRow struct {
	Title        string
	Author       string
	Barcode      string
	ReturnedAt   string // ตัว handler ฝั่ง caller format วันที่/เวลาเป็น string มาให้แล้ว
	BorrowerCode string
	BorrowerName string
}

// ส่งอีเมลแจ้งเตือนว่าตู้รับคืนหนังสือเต็ม ใช้ net/smtp (มาตรฐานของ Go เอง ไม่ต้องพึ่ง library ภายนอก)
// ต้องตั้งค่า SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD ใน .env ก่อนถึงจะส่งได้จริง (ดู .env.example)
// รองรับเฉพาะ SMTP แบบ STARTTLS (พอร์ต 587 ซึ่งเป็นค่ามาตรฐานของผู้ให้บริการอีเมลส่วนใหญ่ เช่น Gmail)
// ถ้ายังไม่ได้ตั้งค่า SMTP หรือยังไม่ได้ระบุอีเมลปลายทาง จะคืน error กลับไปเฉยๆ ไม่ทำให้ระบบหลักพัง
// (ผู้เรียกมีหน้าที่ log แจ้งเตือนเอง ดู handlers.SendCabinetFullNotification)
// books คือรายการหนังสือที่อยู่ในตู้ขณะที่ตู้เต็ม แนบไปเป็นตาราง HTML ในอีเมล เพื่อให้บรรณารักษ์รู้ล่วงหน้า
// ว่าต้องไปเคลียร์หนังสือเล่มไหนบ้าง ใครเป็นคนคืนมา โดยไม่ต้องเปิดหน้า Dashboard มาเช็คก่อน
// รองรับส่งถึงหลายอีเมลพร้อมกันในฉบับเดียว (ใส่ทุกคนไว้ใน To: header และ recipient list ของ SMTP เลย
// ไม่ต้องวนส่งทีละฉบับ)
func SendCabinetFullAlert(toEmails []string, books []CabinetBookRow) error {
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	user := os.Getenv("SMTP_USER")
	password := os.Getenv("SMTP_PASSWORD")
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = user
	}

	if host == "" || port == "" || user == "" || password == "" {
		return fmt.Errorf("ยังไม่ได้ตั้งค่า SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD ใน .env")
	}
	if len(toEmails) == 0 {
		return fmt.Errorf("ยังไม่ได้ระบุอีเมลปลายทาง")
	}

	subject := mime.BEncoding.Encode("UTF-8", "แจ้งเตือน: ตู้รับคืนหนังสืออัตโนมัติเต็มแล้ว")
	body := buildCabinetFullHTML(books)

	msg := []byte(fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s\r\n",
		from, strings.Join(toEmails, ", "), subject, body,
	))

	auth := smtp.PlainAuth("", user, password, host)
	addr := host + ":" + port
	return smtp.SendMail(addr, auth, from, toEmails, msg)
}

func buildCabinetFullHTML(books []CabinetBookRow) string {
	esc := htmlpkg.EscapeString
	var b strings.Builder
	b.WriteString(`<div style="font-family: sans-serif; font-size: 14px; color: #222;">`)
	b.WriteString(`<p>ตู้รับคืนหนังสืออัตโนมัติ เต็มแล้ว กรุณาไปเคลียร์หนังสือออกจากตู้โดยเร็วที่สุด เพื่อให้ระบบรับคืนหนังสือได้ต่อเนื่อง</p>`)

	if len(books) == 0 {
		b.WriteString(`<p>ไม่พบรายการหนังสือในตู้ในฐานข้อมูล (ข้อมูลอาจไม่ตรงกับของจริง กรุณาตรวจสอบหน้า Dashboard)</p>`)
		b.WriteString(`</div>`)
		return b.String()
	}

	b.WriteString(fmt.Sprintf(`<p>รายการหนังสือในตู้ขณะนี้ (%d เล่ม):</p>`, len(books)))
	b.WriteString(`<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%;">`)
	b.WriteString(`<tr style="background:#f0f0f0;">`)
	for _, h := range []string{"ชื่อหนังสือ", "ผู้แต่ง", "Barcode", "คืนเมื่อ", "เลขผู้คืน", "ชื่อผู้คืน"} {
		b.WriteString("<th>" + esc(h) + "</th>")
	}
	b.WriteString(`</tr>`)

	for _, book := range books {
		b.WriteString("<tr>")
		for _, v := range []string{book.Title, book.Author, book.Barcode, book.ReturnedAt, book.BorrowerCode, book.BorrowerName} {
			if v == "" {
				v = "-"
			}
			b.WriteString("<td>" + esc(v) + "</td>")
		}
		b.WriteString("</tr>")
	}
	b.WriteString(`</table></div>`)
	return b.String()
}
