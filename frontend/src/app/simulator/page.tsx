"use client";
import { useState, useEffect } from "react";

const API = "http://localhost:8080";

export default function SimulatorPage() {
  const [capacity, setCapacity] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [motorLogs, setMotorLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [rfidInput, setRfidInput] = useState("");
  const [connectedClients, setConnectedClients] = useState(0);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API}/api/status`);
        const data = await res.json();
        setCapacity(data.capacity);
        setMotorLogs(data.motor_logs || []); // ← ดึง log มอเตอร์จาก Backend
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
      const res = await fetch(`${API}/api/simulator/send`, {
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
    await fetch(`${API}/api/simulate/reset`, { method: "POST" });
    setCapacity(0);
    addLog("🔄 รีเซ็ตตู้แล้ว");
  };

  const getBarColor = () => {
    if (capacity >= 100) return "bg-red-500";
    if (capacity >= 70) return "bg-yellow-400";
    return "bg-green-500";
  };

  // รวม log ทั้งสองแหล่งเรียงตามเวลา โดย Frontend log อยู่บน Motor log อยู่ล่าง
  const allLogs = [...log, ...[...motorLogs].reverse()];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">🛠️ Simulator Dashboard</h1>
          <p className="text-gray-400 text-sm">จำลองฮาร์ดแวร์ — สำหรับนักพัฒนาเท่านั้น</p>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-2 h-2 rounded-full ${connectedClients > 0 ? "bg-green-400" : "bg-gray-500"}`} />
            <p className="text-xs text-gray-400">Tablet เชื่อมต่ออยู่: {connectedClients} เครื่อง</p>
          </div>
        </div>

        {/* ความจุตู้ */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="flex justify-between mb-2">
            <p className="font-semibold">ความจุตู้รับคืน</p>
            <p className="font-bold text-lg">{capacity}%</p>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-4">
            <div className={`h-4 rounded-full transition-all duration-500 ${getBarColor()}`}
              style={{ width: `${capacity}%` }} />
          </div>
          <button onClick={handleReset} className="mt-3 w-full bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-lg text-sm transition">
            🔄 รีเซ็ตความจุตู้
          </button>
        </div>

        {/* จำลอง Barcode Scanner */}
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

        {/* จำลอง RFID Reader */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <h2 className="font-semibold mb-1">📡 จำลอง RFID Reader</h2>
          <p className="text-gray-400 text-xs mb-3">ส่ง ISBN หนังสือ ไปยังหน้า Tablet (แทนการสแกน RFID)</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="ISBN เช่น 978-XXXXXXXXXX"
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

        {/* Mock Terminal */}
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