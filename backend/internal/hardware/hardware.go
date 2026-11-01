package hardware

import "fmt"

type MockHardware struct {
	MotorStatus    string
	MotorLogs      []string
	IsFull         bool
	FastMode       bool
	ForceEmpty     bool // เปิดไว้เมื่อยังไม่ได้ต่อเซนเซอร์ Ultrasonic จริง จะไม่รับสถานะ "เต็ม" จากที่ไหนเลย บังคับว่างเสมอ
	ESP32Connected bool // สถานะ ESP32 (มอเตอร์/RFID) ว่าต่อ MQTT broker อยู่จริงไหม (รู้จาก Last Will/Testament)
}

func NewMockHardware() *MockHardware {
	return &MockHardware{MotorStatus: "closed", MotorLogs: []string{}, IsFull: false, FastMode: false, ForceEmpty: false, ESP32Connected: false}
}

var Shared *MockHardware

func init() {
	Shared = NewMockHardware()
}

// Hook ให้ชั้นบน (handlers/main) ผูกระบบแจ้งเตือนจริง (เช่นส่งอีเมล) เข้ามาได้ โดยที่ package นี้เอง
// ไม่ต้องรู้จัก database/SMTP เลย — เรียกเฉพาะตอนตู้ "เพิ่ง" เปลี่ยนจากว่างเป็นเต็มเท่านั้น (ดูใน SetFull)
// กันไม่ให้ส่งซ้ำทุกครั้งที่ sensor อ่านค่า "เต็ม" เดิมซ้ำๆ ทุก 1 วินาที
var OnCabinetBecameFull func()

func (m *MockHardware) addLog(msg string) {
	m.MotorLogs = append([]string{msg}, m.MotorLogs...)
	if len(m.MotorLogs) > 20 {
		m.MotorLogs = m.MotorLogs[:20]
	}
	fmt.Println(msg)
}

func (m *MockHardware) SetClosed() string {
	m.MotorStatus = "closed"
	m.addLog("🔒 แกนชัก >> ยืดสุด (ปิด)")
	return "closed"
}

func (m *MockHardware) SetOpen() string {
	m.MotorStatus = "open"
	m.addLog("🔓 แกนชัก >> หดบางส่วน (เปิดรับหนังสือ)")
	return "open"
}

func (m *MockHardware) SetDump() string {
	m.MotorStatus = "dump"
	m.addLog("📤 แกนชัก >> หดสุด (เทหนังสือลงเก็บ)")
	return "dump"
}

func (m *MockHardware) OpenMotor() string {
	return m.SetOpen()
}

func (m *MockHardware) CloseMotor() string {
	return m.SetClosed()
}

func (m *MockHardware) AddBook() {
	status := "ไม่เต็ม"
	if m.IsFull {
		status = "เต็ม"
	}

	m.addLog(fmt.Sprintf("📦 รับหนังสือเข้าตู้ — สถานะ: %s", status))
}

func (m *MockHardware) SetFull(full bool) {
	if m.ForceEmpty {
		// อยู่ในโหมดยังไม่ได้ต่อเซนเซอร์จริง ไม่ว่าใคร/อะไรจะพยายามตั้งเป็นเต็ม ก็บังคับว่างไว้ก่อนเสมอ
		full = false
	}
	wasFull := m.IsFull
	m.IsFull = full
	if full {
		m.addLog("🔴 ตู้เต็ม")
		if !wasFull && OnCabinetBecameFull != nil {
			go OnCabinetBecameFull() // รันแยก goroutine กันการส่งอีเมล (I/O เครือข่าย) บล็อกงานหลัก
		}
	} else {
		m.addLog("🟢 ตู้ว่าง")
	}
}

func (m *MockHardware) SetForceEmpty(force bool) {
	m.ForceEmpty = force
	if force {
		m.addLog("🔌 โหมดไม่ได้ต่อ Ultrasonic — บังคับสถานะตู้ว่างเสมอ")
		m.SetFull(false) // เคลียร์สถานะเต็มที่อาจค้างอยู่ทันที
	} else {
		m.addLog("🔌 ปิดโหมดบังคับตู้ว่าง — กลับไปรับสถานะจากเซนเซอร์ตามจริง")
	}
}

func (m *MockHardware) SetESP32Connected(connected bool) {
	m.ESP32Connected = connected
	if connected {
		m.addLog("🔌 ESP32 (มอเตอร์/RFID) เชื่อมต่อแล้ว")
	} else {
		m.addLog("⚠️ ESP32 (มอเตอร์/RFID) หลุดการเชื่อมต่อ")
	}
}

func (m *MockHardware) SetFastMode(fast bool) {
	m.FastMode = fast
	if fast {
		m.addLog("🚀 เปิดโหมด Fast Mode (จำลองความเร็วสูง)")
	} else {
		m.addLog("🐢 ปิดโหมด Fast Mode (ความเร็วปกติ)")
	}
}
