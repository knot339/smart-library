package handlers

import (
	"encoding/json"
	"log"
	"strconv"
	"strings"
	"time"

	"smart-library-api/internal/database"
	"smart-library-api/internal/hardware"
	"smart-library-api/internal/models"
	"smart-library-api/internal/notify"

	"github.com/gofiber/fiber/v2"
)

// อีเมลเริ่มต้นสำหรับแจ้งเตือนตู้เต็ม ใช้ตอนยังไม่เคยมีใครตั้งค่าไว้ในฐานข้อมูลเลย
const DefaultNotifyEmail = "library@rmutsv.ac.th"
const notifyEmailSettingKey = "notify_email"

// ค่าเริ่มต้นของการตั้งค่าตู้ฝั่งแท็บเล็ต ใช้ตอนยังไม่เคยมีใครตั้งค่าไว้ในฐานข้อมูลเลย
const DefaultDumpSettleMs = 5000   // ระยะเวลารอให้หนังสือตกลงในตู้จัดเก็บหลังเทเสร็จ
const DefaultIdleTimeoutMs = 10000 // ไม่มีการใช้งานหน้าจอนานเท่าไหร่ถึงจะกลับหน้าแรกอัตโนมัติ
const dumpSettleMsSettingKey = "system_dump_settle_ms"
const idleTimeoutMsSettingKey = "system_idle_timeout_ms"
const voiceEnabledSettingKey = "system_voice_enabled"

// ดึงค่า setting แบบ key-value ทั่วไป คืนค่าว่างถ้ายังไม่เคยตั้งไว้เลย
func getSettingValue(key string) string {
	var setting models.Setting
	if err := database.DB.Where("key = ?", key).First(&setting).Error; err == nil {
		return setting.Value
	}
	return ""
}

// บันทึก/แก้ไขค่า setting แบบ key-value ทั่วไป (upsert)
func upsertSetting(key, value string) {
	var setting models.Setting
	if err := database.DB.Where("key = ?", key).First(&setting).Error; err != nil {
		database.DB.Create(&models.Setting{Key: key, Value: value})
	} else {
		setting.Value = value
		database.DB.Save(&setting)
	}
}

// resolveCabinetID อ่าน cabinet_id จาก URL param ":id" ถ้ามี (เส้นทางใหม่ที่รองรับหลายตู้) ไม่งั้น
// fallback เป็นตู้เริ่มต้น — ทำให้ handler ตัวเดียวใช้ได้ทั้งเส้นทางเดิม (ยังไม่ระบุตู้ เพื่อไม่ให้
// frontend เดิมที่ยังไม่รู้จัก cabinet_id พังระหว่างทำระบบหลายตู้) และเส้นทางใหม่แบบ /cabinet/:id/...
func resolveCabinetID(c *fiber.Ctx) string {
	if id := c.Params("id"); id != "" {
		return id
	}
	return hardware.DefaultCabinetID
}

// publishToCabinet ส่งข้อความไปยังตู้ที่ระบุผ่าน MQTT topic ของตู้นั้นโดยเฉพาะ (smartlibrary/<cabinet_id>/control)
func publishToCabinet(cabinetID string, msg WSMessage) {
	if MQTTClient != nil && MQTTClient.IsConnected() {
		payload, _ := json.Marshal(msg)
		topic := "smartlibrary/" + cabinetID + "/control"
		token := MQTTClient.Publish(topic, 0, false, payload)
		token.WaitTimeout(2 * time.Second)
	}
}

// settleMs มีผลเฉพาะตอน status == "dump" เท่านั้น (ส่ง 0 ไปสำหรับ open/close) — บอก ESP32 ว่าต้องพัก
// การเช็คเซนเซอร์ตู้เต็มนานแค่ไหนหลังเทหนังสือเสร็จ ให้ตรงกับค่าที่ตั้งไว้ในหน้า Dashboard จริงๆ แทนที่
// ESP32 จะใช้ค่าคงที่ของตัวเองซึ่งอาจไม่ตรงกับที่ผู้ดูแลตั้งไว้
func publishMotor(cabinetID, status string, settleMs int) {
	msg := WSMessage{Type: "motor", Value: status}
	if status == "dump" && settleMs > 0 {
		msg.SettleMs = settleMs
	}
	publishToCabinet(cabinetID, msg)
}

func GetCabinetStatus(c *fiber.Ctx) error {
	hw := hardware.ForCabinet(resolveCabinetID(c))
	return c.JSON(fiber.Map{
		"is_full":      hw.IsFull,
		"motor_status": hw.MotorStatus,
		"is_locked":    hw.IsLocked,
		"status":       "online",
	})
}

// สั่งล็อก/ปลดล็อกกลอนไฟฟ้าของตู้ (คนละตัวกับมอเตอร์แกนชักที่รับหนังสือ) — อัปเดตสถานะในฝั่ง backend
// ทันทีแบบ optimistic (เหมือนกับ OpenMotor/CloseMotor/DumpMotor) ไม่รอ ESP32 ยืนยันกลับ
func SetCabinetLock(c *fiber.Ctx) error {
	cabinetID := resolveCabinetID(c)
	type SetLockRequest struct {
		Locked bool `json:"locked"`
	}
	req := new(SetLockRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	hw := hardware.ForCabinet(cabinetID)
	hw.SetLocked(req.Locked)
	value := "lock"
	if !req.Locked {
		value = "unlock"
	}
	publishToCabinet(cabinetID, WSMessage{Type: "lock", Value: value})

	message := "ล็อกตู้แล้ว"
	if !req.Locked {
		message = "ปลดล็อกตู้แล้ว"
	}
	return c.JSON(fiber.Map{"message": message, "is_locked": hw.IsLocked})
}

// ดึงค่าระยะเวลารอให้หนังสือตกลงในตู้หลังเทเสร็จที่ตั้งไว้ (ถ้ายังไม่เคยตั้งค่าไว้เลย คืนค่าเริ่มต้น)
// ใช้ร่วมกันทั้ง GetSystemSettings (โชว์ในหน้า Dashboard) และ DumpMotor (ส่งค่าจริงไปให้ ESP32 ใช้พัก
// การเช็คเซนเซอร์ตู้เต็มช่วงเทหนังสือ กันค่าสองที่นี้เพี้ยนไม่ตรงกัน)
func getConfiguredDumpSettleMs() int {
	if v := getSettingValue(dumpSettleMsSettingKey); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return DefaultDumpSettleMs
}

// ดึงค่าตั้งค่าของระบบฝั่งแท็บเล็ตคืนหนังสือ (ระยะเวลารอต่างๆ / เปิดปิดเสียงพูด) ให้หน้าแท็บเล็ตดึงไปใช้
// แทนค่าที่เคย hardcode ไว้ในโค้ด ถ้ายังไม่เคยมีใครตั้งค่าไว้เลยจะคืนค่าเริ่มต้นไปก่อน
func GetSystemSettings(c *fiber.Ctx) error {
	dumpSettleMs := getConfiguredDumpSettleMs()
	idleTimeoutMs := DefaultIdleTimeoutMs
	if v := getSettingValue(idleTimeoutMsSettingKey); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			idleTimeoutMs = n
		}
	}
	// ค่าเริ่มต้นเปิดเสียงไว้ก่อน (ถ้ายังไม่เคยตั้งค่าเลย getSettingValue จะคืนค่าว่าง ซึ่งไม่เท่ากับ "false")
	voiceEnabled := getSettingValue(voiceEnabledSettingKey) != "false"

	return c.JSON(fiber.Map{
		"dump_settle_ms":  dumpSettleMs,
		"idle_timeout_ms": idleTimeoutMs,
		"voice_enabled":   voiceEnabled,
	})
}

// บันทึกค่าตั้งค่าของระบบฝั่งแท็บเล็ตคืนหนังสือ จำกัดช่วงค่าที่รับไว้พอสมควรกันตั้งค่าเพี้ยนจนระบบใช้งานไม่ได้
// (เช่น ตั้งเวลารอเทหนังสือเป็น 0 วินาที จะทำให้ปิดฝาก่อนหนังสือตกลงไปในตู้จริงครบ)
func SetSystemSettings(c *fiber.Ctx) error {
	type SystemSettingsRequest struct {
		DumpSettleMs  int  `json:"dump_settle_ms"`
		IdleTimeoutMs int  `json:"idle_timeout_ms"`
		VoiceEnabled  bool `json:"voice_enabled"`
	}
	req := new(SystemSettingsRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	if req.DumpSettleMs < 1000 || req.DumpSettleMs > 60000 {
		return c.Status(400).JSON(fiber.Map{"error": "ระยะเวลารอเทหนังสือต้องอยู่ระหว่าง 1-60 วินาที"})
	}
	if req.IdleTimeoutMs < 3000 || req.IdleTimeoutMs > 300000 {
		return c.Status(400).JSON(fiber.Map{"error": "ระยะเวลาไม่มีการใช้งานต้องอยู่ระหว่าง 3-300 วินาที"})
	}

	upsertSetting(dumpSettleMsSettingKey, strconv.Itoa(req.DumpSettleMs))
	upsertSetting(idleTimeoutMsSettingKey, strconv.Itoa(req.IdleTimeoutMs))
	upsertSetting(voiceEnabledSettingKey, strconv.FormatBool(req.VoiceEnabled))

	return c.JSON(fiber.Map{"message": "บันทึกการตั้งค่าตู้สำเร็จ"})
}

// ดึงรายชื่ออีเมลที่ตั้งไว้สำหรับแจ้งเตือนตู้เต็ม (ถ้ายังไม่เคยตั้งค่าไว้เลย คืนค่าเริ่มต้นของห้องสมุดไปก่อน)
func GetNotifyEmail(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"emails": getConfiguredNotifyEmails()})
}

// บันทึกรายชื่ออีเมลสำหรับแจ้งเตือนตู้เต็มใหม่ทั้งชุด (upsert ลงตาราง settings แบบ comma-separated
// string เดียว เหมือนกับที่ LINE target_id ใช้อยู่แล้ว) รองรับได้หลายอีเมลพร้อมกัน
func SetNotifyEmail(c *fiber.Ctx) error {
	type NotifyEmailRequest struct {
		Emails []string `json:"emails"`
	}
	req := new(NotifyEmailRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	emails := make([]string, 0, len(req.Emails))
	for _, e := range req.Emails {
		if t := strings.TrimSpace(e); t != "" {
			emails = append(emails, t)
		}
	}
	if len(emails) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณาระบุอีเมลอย่างน้อย 1 รายการ"})
	}

	upsertSetting(notifyEmailSettingKey, strings.Join(emails, ","))

	return c.JSON(fiber.Map{"message": "บันทึกอีเมลแจ้งเตือนสำเร็จ", "emails": emails})
}

// ดึงรายการ LINE Official Account ที่ตั้งค่าไว้ทั้งหมด (รองรับหลายตัว แต่ละตัวมี Channel Access Token
// และปลายทางของตัวเอง) ไม่คืน token กลับไปตรงๆ เพราะเทียบเท่ารหัสผ่าน ให้รู้แค่ว่าตั้งไว้แล้วหรือยัง
func GetNotifyLine(c *fiber.Ctx) error {
	var channels []models.LineChannel
	database.DB.Order("id asc").Find(&channels)

	result := make([]fiber.Map, 0, len(channels))
	for _, ch := range channels {
		result = append(result, fiber.Map{
			"id":               ch.ID,
			"targets":          parseCommaList(ch.Targets),
			"token_configured": ch.Token != "",
		})
	}
	return c.JSON(fiber.Map{"channels": result})
}

// เพิ่ม LINE Official Account ใหม่ (Channel Access Token + รายการ User/Group ID ปลายทาง) ต้องระบุ
// ทั้งสองอย่างตอนสร้างใหม่เสมอ เพราะยังไม่มีค่าเดิมให้ใช้ต่อ
func CreateNotifyLineChannel(c *fiber.Ctx) error {
	type NotifyLineRequest struct {
		ChannelAccessToken string   `json:"channel_access_token"`
		Targets            []string `json:"targets"`
	}
	req := new(NotifyLineRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	token := strings.TrimSpace(req.ChannelAccessToken)
	targets := make([]string, 0, len(req.Targets))
	for _, t := range req.Targets {
		if v := strings.TrimSpace(t); v != "" {
			targets = append(targets, v)
		}
	}
	if token == "" {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณาระบุ Channel Access Token"})
	}
	if len(targets) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณาระบุ User/Group ID ปลายทางอย่างน้อย 1 รายการ"})
	}

	channel := models.LineChannel{Token: token, Targets: strings.Join(targets, ",")}
	if err := database.DB.Create(&channel).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(201).JSON(fiber.Map{
		"message": "เพิ่ม LINE Official Account สำเร็จ",
		"id":      channel.ID,
		"targets": targets,
	})
}

// แก้ไข LINE Official Account ที่มีอยู่ — ปล่อย channel_access_token ว่างไว้ได้ถ้าไม่ต้องการเปลี่ยน
// (จะใช้ Token เดิมต่อ) แต่ targets ต้องส่งมาครบทั้งชุดเสมอ (แทนที่ชุดเดิมทั้งหมด)
func UpdateNotifyLineChannel(c *fiber.Ctx) error {
	id := c.Params("id")
	var channel models.LineChannel
	if err := database.DB.First(&channel, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบ LINE Official Account นี้"})
	}

	type NotifyLineRequest struct {
		ChannelAccessToken string   `json:"channel_access_token"`
		Targets            []string `json:"targets"`
	}
	req := new(NotifyLineRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	targets := make([]string, 0, len(req.Targets))
	for _, t := range req.Targets {
		if v := strings.TrimSpace(t); v != "" {
			targets = append(targets, v)
		}
	}
	if len(targets) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณาระบุ User/Group ID ปลายทางอย่างน้อย 1 รายการ"})
	}

	channel.Targets = strings.Join(targets, ",")
	if token := strings.TrimSpace(req.ChannelAccessToken); token != "" {
		channel.Token = token
	}
	database.DB.Save(&channel)

	return c.JSON(fiber.Map{"message": "บันทึกการตั้งค่า LINE สำเร็จ", "targets": targets})
}

// ลบ LINE Official Account ออกจากรายการแจ้งเตือน
func DeleteNotifyLineChannel(c *fiber.Ctx) error {
	id := c.Params("id")
	database.DB.Delete(&models.LineChannel{}, id)
	return c.JSON(fiber.Map{"message": "ลบ LINE Official Account สำเร็จ"})
}

// รับ webhook event จาก LINE Messaging API — ใช้ชั่วคราวตอนตั้งค่าครั้งแรกเพื่อหา User ID/Group ID
// ปลายทาง (log ออกมาให้ดูค่าเอาไปกรอกในหน้า Dashboard) ไม่ได้ตรวจสอบลายเซ็น (X-Line-Signature) เพราะ
// ไม่ได้ใช้เป็น webhook รับส่งข้อความจริงจังในระบบ แค่ใช้หาค่า ID ตอน setup เท่านั้น
func LineWebhook(c *fiber.Ctx) error {
	type lineSource struct {
		Type    string `json:"type"`
		UserID  string `json:"userId"`
		GroupID string `json:"groupId"`
	}
	type lineEvent struct {
		Source lineSource `json:"source"`
	}
	type lineWebhookBody struct {
		Events []lineEvent `json:"events"`
	}

	body := new(lineWebhookBody)
	if err := c.BodyParser(body); err != nil {
		return c.SendStatus(200) // ตอบ 200 เสมอ กัน LINE retry รัว ต่อให้ body parse ไม่ได้
	}

	for _, e := range body.Events {
		switch e.Source.Type {
		case "user":
			log.Printf("📱 LINE webhook: ได้รับข้อความจาก User ID = %s (เอาไปกรอกในหน้า Dashboard ได้เลย)", e.Source.UserID)
		case "group":
			log.Printf("📱 LINE webhook: ได้รับข้อความจาก Group ID = %s (เอาไปกรอกในหน้า Dashboard ได้เลย)", e.Source.GroupID)
		}
	}

	return c.SendStatus(200)
}

func getConfiguredNotifyEmails() []string {
	emails := parseCommaList(getSettingValue(notifyEmailSettingKey))
	if len(emails) == 0 {
		return []string{DefaultNotifyEmail}
	}
	return emails
}

// SendCabinetFullNotification ผูกไว้กับ hardware.OnCabinetBecameFull ใน main.go เรียกอัตโนมัติ
// ทุกครั้งที่ตู้เพิ่งเปลี่ยนจากว่างเป็นเต็ม (ไม่ใช่ทุกครั้งที่ poll สถานะเดิมซ้ำ) ส่งทั้งอีเมลและ LINE
// (ถ้าตั้งค่าไว้) เป็นอิสระจากกัน — ช่องทางหนึ่ง/ตัวหนึ่งส่งไม่สำเร็จไม่กระทบตัวอื่น ส่งผ่านทุก LINE
// Official Account ที่ตั้งไว้ (แต่ละตัวมี Token และปลายทางของตัวเอง รองรับส่งไปคนละกลุ่มได้)
// cabinetID ใช้แค่ log ตอนนี้ (ระบบแจ้งเตือน/รายการหนังสือในตู้ยังเป็นภาพรวมทั้งระบบ ไม่ได้แยกตามตู้
// เพราะ BorrowRecord ยังไม่มี cabinet_id — ปล่อยไว้ก่อนตามขอบเขตของเฟสนี้)
func SendCabinetFullNotification(cabinetID string) {
	books := getBooksInCabinetRows()

	emails := getConfiguredNotifyEmails()
	if err := notify.SendCabinetFullAlert(emails, books); err != nil {
		log.Printf("⚠️ ส่งอีเมลแจ้งเตือนตู้เต็ม [%s] ไม่สำเร็จ: %v", cabinetID, err)
	} else {
		log.Printf("📧 ส่งอีเมลแจ้งเตือนตู้เต็ม [%s] ไปที่ %s สำเร็จ (%d เล่ม)", cabinetID, strings.Join(emails, ", "), len(books))
	}

	var lineChannels []models.LineChannel
	database.DB.Find(&lineChannels)
	if len(lineChannels) > 0 {
		lineText := notify.BuildCabinetFullLineText(books)
		for _, ch := range lineChannels {
			targets := parseCommaList(ch.Targets)
			if ch.Token == "" || len(targets) == 0 {
				continue
			}
			for _, target := range targets {
				if err := notify.SendLineMessage(ch.Token, target, lineText); err != nil {
					log.Printf("⚠️ ส่งแจ้งเตือน LINE (OA #%d) ไปที่ %s ไม่สำเร็จ: %v", ch.ID, target, err)
				} else {
					log.Printf("📱 ส่งแจ้งเตือน LINE (OA #%d) ไปที่ %s สำเร็จ (%d เล่ม)", ch.ID, target, len(books))
				}
			}
		}
	}
}

// แยกค่าที่คั่นด้วยคอมมาในช่องเดียว ออกเป็นหลายรายการ (ตัดช่องว่างและรายการว่างออกให้ด้วย) ใช้ร่วมกันทั้ง
// รายชื่ออีเมล (เก็บใน settings) และ targets ของแต่ละ LINE Official Account (เก็บใน LineChannel.Targets)
// เพื่อรองรับส่งแจ้งเตือนถึงหลายปลายทางพร้อมกันโดยเก็บเป็น string เดียวแบบ comma-separated
func parseCommaList(raw string) []string {
	parts := strings.Split(raw, ",")
	items := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			items = append(items, t)
		}
	}
	return items
}

// ดึงรายการหนังสือที่อยู่ในตู้ขณะนี้ (ชื่อ/ผู้แต่ง/Barcode/คืนเมื่อ/ผู้คืน) ใช้แนบไปเป็นตารางในอีเมลแจ้งเตือนตู้เต็ม
// ใช้ query เดียวกับ GetBooksInCabinet แต่ส่งคืนเป็น []notify.CabinetBookRow แทน fiber.Map ที่ผูกกับ HTTP response
func getBooksInCabinetRows() []notify.CabinetBookRow {
	var records []models.BorrowRecord
	database.DB.
		Where("status = ? AND returned_at IS NOT NULL", "returned").
		Order("returned_at DESC").
		Find(&records)

	barcodes := make([]string, 0, len(records))
	seen := map[string]bool{}
	for _, r := range records {
		if r.BookBarcode != "" && !seen[r.BookBarcode] {
			seen[r.BookBarcode] = true
			barcodes = append(barcodes, r.BookBarcode)
		}
	}
	var bookList []models.Book
	if len(barcodes) > 0 {
		database.DB.Where("barcode IN ?", barcodes).Find(&bookList)
	}
	bookByBarcode := make(map[string]models.Book, len(bookList))
	for _, b := range bookList {
		bookByBarcode[b.Barcode] = b
	}

	rows := make([]notify.CabinetBookRow, 0, len(records))
	added := map[string]bool{}
	for _, r := range records {
		if added[r.BookBarcode] {
			continue
		}
		added[r.BookBarcode] = true

		title, author := r.BookBarcode, ""
		if b, ok := bookByBarcode[r.BookBarcode]; ok {
			title = b.Title
			author = b.Author
		}
		returnedAt := ""
		if r.ReturnedAt != nil {
			returnedAt = r.ReturnedAt.In(time.Local).Format("02/01/2006 15:04")
		}
		rows = append(rows, notify.CabinetBookRow{
			Title:        title,
			Author:       author,
			Barcode:      r.BookBarcode,
			ReturnedAt:   returnedAt,
			BorrowerCode: r.BorrowerCode,
			BorrowerName: r.BorrowerName,
		})
	}
	return rows
}

func OpenMotor(c *fiber.Ctx) error {
	cabinetID := resolveCabinetID(c)
	hw := hardware.ForCabinet(cabinetID)
	hw.SetOpen()
	publishMotor(cabinetID, "open", 0)
	return c.JSON(fiber.Map{
		"message":      "เปิดรับหนังสือแล้ว",
		"motor_status": hw.MotorStatus,
	})
}

func CloseMotor(c *fiber.Ctx) error {
	cabinetID := resolveCabinetID(c)
	hw := hardware.ForCabinet(cabinetID)
	hw.SetClosed()
	publishMotor(cabinetID, "close", 0)
	return c.JSON(fiber.Map{
		"message":      "ปิดตู้แล้ว",
		"motor_status": hw.MotorStatus,
	})
}

func DumpMotor(c *fiber.Ctx) error {
	cabinetID := resolveCabinetID(c)
	hw := hardware.ForCabinet(cabinetID)
	hw.SetDump()
	publishMotor(cabinetID, "dump", getConfiguredDumpSettleMs())
	return c.JSON(fiber.Map{
		"message":      "เทหนังสือลงเก็บแล้ว",
		"motor_status": hw.MotorStatus,
	})
}

func SetCabinetFull(c *fiber.Ctx) error {
	type SetFullRequest struct {
		IsFull bool `json:"is_full"`
	}
	req := new(SetFullRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	hw := hardware.ForCabinet(resolveCabinetID(c))
	hw.SetFull(req.IsFull)
	return c.JSON(fiber.Map{
		"message": "ตั้งค่าสถานะตู้สำเร็จ",
		"is_full": hw.IsFull,
	})
}

func GetBooksInCabinet(c *fiber.Ctx) error {
	var records []models.BorrowRecord
	database.DB.
		Where("status = ? AND returned_at IS NOT NULL", "returned").
		Order("returned_at DESC").
		Find(&records)

	// ดึงรายละเอียดหนังสือ (ชื่อ/ผู้แต่ง/ISBN) จากฐานข้อมูลของตัวเองมาแสดงประกอบ
	// BorrowRecord เก็บแค่ BookBarcode ไม่มี FK ผูกกับ Book แล้ว จึงต้องมา join เอาเองตรงนี้
	barcodes := make([]string, 0, len(records))
	seen := map[string]bool{}
	for _, r := range records {
		if r.BookBarcode != "" && !seen[r.BookBarcode] {
			seen[r.BookBarcode] = true
			barcodes = append(barcodes, r.BookBarcode)
		}
	}
	var bookList []models.Book
	if len(barcodes) > 0 {
		database.DB.Where("barcode IN ?", barcodes).Find(&bookList)
	}
	bookByBarcode := make(map[string]models.Book, len(bookList))
	for _, b := range bookList {
		bookByBarcode[b.Barcode] = b
	}

	bookMap := make(map[string]fiber.Map)
	for _, r := range records {
		if _, exists := bookMap[r.BookBarcode]; !exists {
			title, author, isbn := r.BookBarcode, "-", "-"
			if b, ok := bookByBarcode[r.BookBarcode]; ok {
				title = b.Title
				author = b.Author
				if b.ISBN != "" {
					isbn = b.ISBN
				}
			}
			bookMap[r.BookBarcode] = fiber.Map{
				"id":                r.ID,
				"barcode":           r.BookBarcode,
				"title":             title,
				"author":            author,
				"isbn":              isbn,
				"returned_at":       r.ReturnedAt,
				"returned_by":       r.BorrowerCode,
				"returned_by_name":  r.BorrowerName,
				"returned_by_phone": r.ReturnedByPhone,
			}
		}
	}

	// สร้าง books ตามลำดับของ records ที่ query มา (เรียง returned_at DESC อยู่แล้ว) ไม่ใช่ไล่จาก
	// bookMap ตรงๆ เพราะ Go map ไม่รับประกันลำดับการวน iterate เลยทำให้ลำดับสลับมั่วทุกครั้งที่ refresh
	books := make([]fiber.Map, 0, len(bookMap))
	addedBarcode := make(map[string]bool, len(bookMap))
	for _, r := range records {
		if addedBarcode[r.BookBarcode] {
			continue
		}
		addedBarcode[r.BookBarcode] = true
		books = append(books, bookMap[r.BookBarcode])
	}
	return c.JSON(fiber.Map{"count": len(books), "books": books})
}

func GetRecentReturns(c *fiber.Ctx) error {
	var records []models.BorrowRecord
	database.DB.
		Where("status IN ?", []string{"returned", "archived"}).
		Order("returned_at DESC").
		Limit(20).
		Find(&records)
	return c.JSON(records)
}

func ResetCabinet(c *fiber.Ctx) error {
	hw := hardware.ForCabinet(resolveCabinetID(c))
	hw.SetClosed()

	database.DB.Model(&models.BorrowRecord{}).
		Where("status = ?", "returned").
		Update("status", "archived")

	return c.JSON(fiber.Map{
		"message":      "รีเซ็ตรายการในตู้สำเร็จ",
		"motor_status": hw.MotorStatus,
	})
}

// สั่งแท็บเล็ตที่ผูกกับตู้นี้อยู่ (ถ้าเปิดหน้าเว็บ+ต่อ WebSocket ค้างไว้อยู่) ให้ล้างรหัสตู้ที่บันทึกไว้
// แล้วกลับไปโชว์หน้าจอตั้งค่าใหม่ — ใช้แก้ตอนตั้งรหัสตู้ผิดตอนติดตั้ง ไม่ต้องเดินไปแตะตัวเครื่องเอง
func ResetTabletSetup(c *fiber.Ctx) error {
	cabinetID := resolveCabinetID(c)
	notified := notifyTabletsResetSetup(cabinetID)
	if notified == 0 {
		return c.JSON(fiber.Map{
			"message":  "ไม่พบแท็บเล็ตที่ออนไลน์อยู่สำหรับตู้นี้ — ต้องไปกดที่ปุ่มโลโก้ 5 ครั้งที่ตัวเครื่องแทน",
			"notified": 0,
		})
	}
	return c.JSON(fiber.Map{
		"message":  "สั่งเคลียร์การตั้งค่าแท็บเล็ตแล้ว",
		"notified": notified,
	})
}
