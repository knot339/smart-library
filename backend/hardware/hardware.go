package hardware

import "fmt"

// 3 สถานะของมอเตอร์
// "closed" = แกนชักยืดสุด (ปิดรับหนังสือ)
// "open"   = แกนชักหดบางส่วน (เปิดรับหนังสือ)
// "dump"   = แกนชักหดสุด (เทหนังสือลงเก็บ)

type MockHardware struct {
	Capacity    int
	MotorStatus string
}

func NewMockHardware() *MockHardware {
	return &MockHardware{Capacity: 0, MotorStatus: "closed"}
}

func (m *MockHardware) SetClosed() string {
	m.MotorStatus = "closed"
	fmt.Println("[Mock] 🔒 แกนชัก >> ยืดสุด (ปิด)")
	return "closed"
}

func (m *MockHardware) SetOpen() string {
	m.MotorStatus = "open"
	fmt.Println("[Mock] 🔓 แกนชัก >> หดบางส่วน (เปิดรับหนังสือ)")
	return "open"
}

func (m *MockHardware) SetDump() string {
	m.MotorStatus = "dump"
	fmt.Println("[Mock] 📤 แกนชัก >> หดสุด (เทหนังสือลงเก็บ)")
	return "dump"
}

// ใช้ตอนจำลองการหย่อนหนังสือ: เปิด → รอ → เท → ปิด
func (m *MockHardware) OpenMotor() string {
	return m.SetOpen()
}

func (m *MockHardware) CloseMotor() string {
	return m.SetClosed()
}

func (m *MockHardware) AddBook() int {
	if m.Capacity < 100 {
		m.Capacity += 10
	}
	return m.Capacity
}
