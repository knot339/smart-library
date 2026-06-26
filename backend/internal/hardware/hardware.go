package hardware

import "fmt"

type MockHardware struct {
	MotorStatus string
	MotorLogs   []string
	IsFull      bool
}

func NewMockHardware() *MockHardware {
	return &MockHardware{MotorStatus: "closed", MotorLogs: []string{}, IsFull: false}
}

var Shared *MockHardware

func init() {
	Shared = NewMockHardware()
}

func (m *MockHardware) addLog(msg string) {
	m.MotorLogs = append([]string{msg}, m.MotorLogs...)
	if len(m.MotorLogs) > 20 {
		m.MotorLogs = m.MotorLogs[:20]
	}
	fmt.Println("[Mock]", msg)
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
	m.IsFull = full
	if full {
		m.addLog("🔴 ตู้เต็ม")
	} else {
		m.addLog("🟢 ตู้ว่าง")
	}
}
