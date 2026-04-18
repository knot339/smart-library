package hardware

import "fmt"

type MockHardware struct {
    Capacity int
}

func NewMockHardware() *MockHardware {
    return &MockHardware{Capacity: 0}
}

func (m *MockHardware) OpenMotor() string {
    fmt.Println("[Mock] ✅ มอเตอร์แกนชัก >> ยืดออก")
    return "Opened"
}

func (m *MockHardware) CloseMotor() string {
    fmt.Println("[Mock] ✅ มอเตอร์แกนชัก >> หดกลับ")
    return "Closed"
}

func (m *MockHardware) AddBook() int {
    if m.Capacity < 100 {
        m.Capacity += 10
    }
    return m.Capacity
}