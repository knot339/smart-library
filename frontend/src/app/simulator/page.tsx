"use client";
import { useState, useEffect } from "react";
import { API_BASE_URL as API } from "../../lib/config";

export default function SimulatorPage() {
  const [isFull, setIsFull] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [motorLogs, setMotorLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [rfidInput, setRfidInput] = useState("");
  const [connectedClients, setConnectedClients] = useState(0);
  const [ledOn, setLedOn] = useState(false); // ใช้สำหรับทดสอบการเชื่อมต่อกับอุปกรณ์ ESP32

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API}/status`);
        const data = await res.json();
        setIsFull(data.is_full);
        setMotorLogs(data.motor_logs || []); // ดึงข้อมูลประวัติการทำงาน (log) ของมอเตอร์จาก Backend
      } catch (err) {
        console.error("Fetch status error:", err);
      }
    };
    fetchStatus();
    const t = setInterval(fetchStatus, 2000);
    return () => clearInterval(t);
  }, []);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString("th-TH");
    setLog((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 15));
  };

  const sendToTablet = async (type: "barcode" | "rfid", value: string) => {
    if (!value.trim()) {
      addLog(`⚠️ กรุณากรอกค่า ${type === "barcode" ? "Barcode" : "RFID"} ก่อน`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/simulator/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value }),
      });
      const data = await res.json();
      setConnectedClients(data.clients || 0);
      addLog(`📡 ส่ง ${type.toUpperCase()} → "${value}" ไปยัง ${data.clients} tablet`);
    } catch (err) {
      console.error("Send error:", err);
      addLog("❌ ส่งสัญญาณไม่ได้ ตรวจสอบ Backend");
    }
    setLoading(false);
  };

  const handleReset = async () => {
    await fetch(`${API}/simulate/reset`, { method: "POST" });
    setIsFull(false);
    addLog("🔄 รีเซ็ตตู้แล้ว");
  };

  const setFullState = async (full: boolean) => {
    try {
      const res = await fetch(`${API}/dashboard/cabinet/set-full`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_full: full }),
      });
      const data = await res.json();
      setIsFull(full);
      addLog(full ? "🔴 ตู้เต็ม" : "🟢 ตู้ว่าง");
    } catch {
      addLog("❌ ตั้งค่าตู้ไม่สำเร็จ");
    }
  };



  // นำประวัติการทำงาน (Log) ทั้งสองแหล่งมารวมและเรียงตามลำดับเวลา โดยนำประวัติจาก Frontend ไว้ด้านบน
  const allLogs = [...log, ...[...motorLogs].reverse()];

  // ทดสอบการสั่งการเชื่อมต่อฮาร์ดแวร์ ESP32 (ทดสอบด้วยการเปิด-ปิด LED)
  const toggleLED = async (on: boolean) => {
    try {
      const res = await fetch(`${API}/simulator/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "led", value: on ? "on" : "off" }),
      });
      const data = await res.json();
      setLedOn(on);
      addLog(`💡 LED → ${on ? "เปิด" : "ปิด"} (ส่งไปยัง ${data.clients} ESP32)`);
    } catch {
      addLog("❌ ส่งคำสั่ง LED ไม่ได้");
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">

        {/* ส่วนหัวของหน้าต่างจำลอง (Header) */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">🛠️ Simulator Dashboard</h1>
          <p className="text-gray-400 text-sm">จำลองฮาร์ดแวร์ — สำหรับนักพัฒนาเท่านั้น</p>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${connectedClients > 0 ? "bg-green-400" : "bg-gray-500"}`} />
            <p className="text-xs text-gray-400">Tablet เชื่อมต่ออยู่: {connectedClients} เครื่อง</p>
          </div>
        </div>

        {/* ส่วนการแสดงผลและปรับแต่งสถานะของตู้รับคืน */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-4">
            <p className="font-semibold">สถานะตู้รับคืน</p>
            <div className={`text-2xl ${isFull ? "🔴" : "🟢"}`}></div>
          </div>
          <p className={`text-center text-lg font-bold mb-4 ${isFull ? "text-red-400" : "text-green-400"}`}>
            {isFull ? "เต็ม" : "ไม่เต็ม"}
          </p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setFullState(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${!isFull ? "bg-green-600" : "bg-gray-600 hover:bg-gray-500"}`}
            >
              🟢 ตู้ว่าง
            </button>
            <button
              onClick={() => setFullState(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${isFull ? "bg-red-600" : "bg-gray-600 hover:bg-gray-500"}`}
            >
              🔴 ตู้เต็ม
            </button>
          </div>
          <button onClick={handleReset} className="w-full bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-lg text-sm transition">
            🔄 รีเซ็ต
          </button>
        </div>

        {/* ส่วนการจำลองการทำงานของเครื่องอ่านบาร์โค้ด (Barcode Scanner) */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <h2 className="font-semibold mb-1">📷 จำลอง Barcode Scanner</h2>
          <p className="text-gray-400 text-xs mb-3">ส่งรหัสนักศึกษา/เบอร์โทร ไปยังหน้า Tablet (แทนการสแกนบัตร)</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="รหัสนักศึกษา หรือ เบอร์โทร"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendToTablet("barcode", barcodeInput)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={() => sendToTablet("barcode", barcodeInput)}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold px-4 py-2 rounded-lg transition"
            >
              ส่ง
            </button>
          </div>
        </div>

        {/* ส่วนการจำลองการทำงานของเครื่องอ่าน RFID (RFID Reader) */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <h2 className="font-semibold mb-1">📡 จำลอง RFID Reader</h2>
          <p className="text-gray-400 text-xs mb-3">ส่ง Barcode/RFID หนังสือ ไปยังหน้า Tablet (แทนการสแกน RFID)</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Barcode หรือ รหัสหนังสือ"
              value={rfidInput}
              onChange={(e) => setRfidInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendToTablet("rfid", rfidInput)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-400"
            />
            <button
              onClick={() => sendToTablet("rfid", rfidInput)}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold px-4 py-2 rounded-lg transition"
            >
              ส่ง
            </button>
          </div>
        </div>

        {/* ส่วนการควบคุมไฟ LED ของอุปกรณ์ ESP32 แบบแมนนวล */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <h2 className="font-semibold mb-1">💡 ควบคุม Built-in LED (ESP32)</h2>
          <p className="text-gray-400 text-xs mb-3">สั่งเปิด/ปิด LED ที่ขา GPIO2 ของ ESP32</p>
          <div className="flex items-center gap-4">
            <div className={`w-8 h-8 rounded-full border-2 transition-all ${ledOn ? "bg-yellow-400 border-yellow-300 shadow-lg shadow-yellow-400/50" : "bg-gray-600 border-gray-500"}`} />
            <div className="flex gap-2 flex-1">
              <button
                onClick={() => toggleLED(true)}
                disabled={ledOn}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg transition"
              >
                💡 เปิด LED
              </button>
              <button
                onClick={() => toggleLED(false)}
                disabled={!ledOn}
                className="flex-1 bg-gray-500 hover:bg-gray-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg transition"
              >
                🌑 ปิด LED
              </button>
            </div>
          </div>
        </div>

        {/* ส่วนการควบคุมมอเตอร์แกนชัก */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <h2 className="font-semibold mb-1">⚙️ จำลองมอเตอร์แกนชัก (Linear Actuator)</h2>
          <p className="text-gray-400 text-xs mb-3">ควบคุมมอเตอร์ (3 ตำแหน่งอัตโนมัติ และ โหมดแมนนวล)</p>
          
          <div className="flex flex-col gap-4 bg-gray-700 p-4 rounded-lg shadow-inner border border-gray-600">
            <div className="grid grid-cols-3 gap-3">
              {/* 3 ตำแหน่งหลัก */}
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${API}/simulator/send`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "motor", value: "open" }),
                    });
                    const data = await res.json();
                    addLog(`⚙️ Motor → เปิด (Open) (ส่งไปยัง ${data.clients} ESP32)`);
                  } catch { addLog(`❌ ส่งคำสั่ง Motor ไม่ได้`); }
                }}
                className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg transition text-sm"
              >
                🟢 เปิด (Open)
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${API}/simulator/send`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "motor", value: "dump" }),
                    });
                    const data = await res.json();
                    addLog(`⚙️ Motor → เทหนังสือ (Dump) (ส่งไปยัง ${data.clients} ESP32)`);
                  } catch { addLog(`❌ ส่งคำสั่ง Motor ไม่ได้`); }
                }}
                className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 rounded-lg transition text-sm"
              >
                📦 เท (Dump)
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${API}/simulator/send`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "motor", value: "close" }),
                    });
                    const data = await res.json();
                    addLog(`⚙️ Motor → ปิด (Close) (ส่งไปยัง ${data.clients} ESP32)`);
                  } catch { addLog(`❌ ส่งคำสั่ง Motor ไม่ได้`); }
                }}
                className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 rounded-lg transition text-sm"
              >
                🔴 ปิด (Close)
              </button>

              {/* แบบแมนนวล */}
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${API}/simulator/send`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "motor", value: "extend" }),
                    });
                    const data = await res.json();
                    addLog(`⚙️ Motor → ยืด (Extend Manual) (ส่งไปยัง ${data.clients} ESP32)`);
                  } catch { addLog(`❌ ส่งคำสั่ง Motor ไม่ได้`); }
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg transition text-sm"
              >
                ⬆️ ยืด (Extend)
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${API}/simulator/send`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "motor", value: "retract" }),
                    });
                    const data = await res.json();
                    addLog(`⚙️ Motor → หด (Retract Manual) (ส่งไปยัง ${data.clients} ESP32)`);
                  } catch { addLog(`❌ ส่งคำสั่ง Motor ไม่ได้`); }
                }}
                className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 rounded-lg transition text-sm"
              >
                ⬇️ หด (Retract)
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${API}/simulator/send`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "motor", value: "stop" }),
                    });
                    const data = await res.json();
                    addLog(`⚙️ Motor → หยุด (Stop) (ส่งไปยัง ${data.clients} ESP32)`);
                  } catch { addLog(`❌ ส่งคำสั่ง Motor ไม่ได้`); }
                }}
                className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-lg transition text-sm shadow-md"
              >
                🛑 หยุด (Stop)
              </button>
            </div>
          </div>
        </div>

        {/* ส่วนแสดงข้อความจำลองประวัติการทำงานในรูปแบบ Terminal (Log) */}
        <div className="bg-black rounded-lg p-4 font-mono text-sm">
          <p className="text-green-400 mb-2">▶ Mock Terminal Log</p>
          {allLogs.length === 0 && <p className="text-gray-500">รอคำสั่ง...</p>}
          {allLogs.map((entry, i) => (
            <p key={i} className={`
              ${entry.includes("❌") ? "text-red-400" :
                entry.includes("⚠️") ? "text-yellow-400" :
                  entry.includes("📡") ? "text-blue-300" :
                    entry.includes("🔒") ? "text-blue-300" :
                      entry.includes("🔓") ? "text-green-300" :
                        entry.includes("📤") ? "text-orange-300" :
                          entry.includes("📦") ? "text-yellow-300" :
                            "text-green-300"}
            `}>
              {entry}
            </p>
          ))}
        </div>

      </div>
    </div>
  );
}