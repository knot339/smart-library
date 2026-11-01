package notify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const lineMessagingPushURL = "https://api.line.me/v2/bot/message/push"

// ส่งข้อความแจ้งเตือนผ่าน LINE Messaging API (Push Message) ไปยัง User ID หรือ Group ID ที่กำหนด
// ต้องมี LINE Official Account ที่เปิดใช้ Messaging API แล้ว (LINE Notify บริการเดิมปิดไปแล้วตั้งแต่ปี 2025)
// ดูวิธีขอ Channel Access Token / User ID จากคำแนะนำที่คุยกันไว้ หรือ https://developers.line.biz/en/docs/messaging-api/
func SendLineMessage(channelAccessToken, targetID, text string) error {
	if channelAccessToken == "" || targetID == "" {
		return fmt.Errorf("ยังไม่ได้ตั้งค่า LINE Channel Access Token หรือ User/Group ID ปลายทาง")
	}
	if text == "" {
		return fmt.Errorf("ข้อความแจ้งเตือนว่างเปล่า")
	}

	// LINE Messaging API จำกัดความยาวข้อความ 1 ชิ้นไว้ที่ 5000 ตัวอักษร ตัดให้ปลอดภัยไว้ก่อนเผื่อ
	// รายการหนังสือยาวมากจนเกินลิมิต (กันข้อความถูกปฏิเสธทั้งชุดเพราะยาวเกินไปนิดเดียว)
	if len(text) > 4900 {
		text = text[:4900] + "\n...(ตัดข้อความที่เหลือ ดูรายละเอียดเต็มได้ที่หน้า Dashboard)"
	}

	payload := map[string]any{
		"to": targetID,
		"messages": []map[string]string{
			{"type": "text", "text": text},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", lineMessagingPushURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+channelAccessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("LINE API ตอบกลับสถานะ %d (ตรวจสอบ Token/Target ID ว่าถูกต้อง และเพิ่มบัญชีเป็นเพื่อนแล้วหรือยัง)", resp.StatusCode)
	}
	return nil
}

// สร้างข้อความสรุปรายการหนังสือในตู้แบบ plain text สำหรับส่งผ่าน LINE — LINE ไม่รองรับตาราง HTML
// เหมือนอีเมล จึงแสดงครบทุกคอลัมน์ (ชื่อหนังสือ/ผู้แต่ง/Barcode/คืนเมื่อ/เลขผู้คืน/ชื่อผู้คืน) แบบ
// คนละบรรทัดต่อเล่มแทน เพื่อให้อ่านง่ายบนหน้าจอมือถือที่แคบ
func BuildCabinetFullLineText(books []CabinetBookRow) string {
	fallback := func(v string) string {
		if v == "" {
			return "-"
		}
		return v
	}

	var b bytes.Buffer
	b.WriteString("📚 แจ้งเตือน: ตู้รับคืนหนังสืออัตโนมัติเต็มแล้ว\nกรุณาไปเคลียร์หนังสือออกจากตู้โดยเร็วที่สุด\n")
	if len(books) == 0 {
		b.WriteString("\nไม่พบรายการหนังสือในตู้ในฐานข้อมูล (กรุณาตรวจสอบหน้า Dashboard)")
		return b.String()
	}
	fmt.Fprintf(&b, "\nรายการหนังสือในตู้ขณะนี้ (%d เล่ม):\n", len(books))
	for i, book := range books {
		fmt.Fprintf(&b,
			"\n%d. ชื่อหนังสือ: %s\nผู้แต่ง: %s\nBarcode: %s\nคืนเมื่อ: %s\nเลขผู้คืน: %s\nชื่อผู้คืน: %s\n",
			i+1,
			fallback(book.Title),
			fallback(book.Author),
			fallback(breakAutoLink(book.Barcode)),
			fallback(breakAutoLink(book.ReturnedAt)),
			fallback(breakAutoLink(book.BorrowerCode)),
			fallback(book.BorrowerName),
		)
	}
	return b.String()
}

// แทรกอักขระ zero-width space (มองไม่เห็น ไม่กระทบการแสดงผล) สลับระหว่างตัวเลข เพื่อกันแอป LINE
// ตรวจจับชุดตัวเลขว่าเป็นเบอร์โทรแล้วทำเป็นลิงก์สีน้ำเงินกดโทรออกอัตโนมัติ (เลขผู้คืน/Barcode เป็นแค่
// รหัสอ้างอิง ไม่ใช่เบอร์โทรที่ต้องกดโทรได้จริง)
func breakAutoLink(s string) string {
	var b strings.Builder
	for _, r := range s {
		b.WriteRune(r)
		if r >= '0' && r <= '9' {
			b.WriteRune('​')
		}
	}
	return b.String()
}
