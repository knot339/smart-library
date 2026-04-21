package hardware

import "fmt"

type MockHardware struct {
	Capacity    int
	MotorStatus string
}

func NewMockHardware() *MockHardware {
	return &MockHardware{Capacity: 0, MotorStatus: "closed"}
}

func (m *MockHardware) OpenMotor() string {
	m.MotorStatus = "open"
	fmt.Println("[Mock] ✅ มอเตอร์แกนชัก >> ยืดออก")
	return "Opened"
}

func (m *MockHardware) CloseMotor() string {
	m.MotorStatus = "closed"
	fmt.Println("[Mock] ✅ มอเตอร์แกนชัก >> หดกลับ")
	return "Closed"
}

func (m *MockHardware) AddBook() int {
	if m.Capacity < 100 {
		m.Capacity += 10
	}
	return m.Capacity
}
