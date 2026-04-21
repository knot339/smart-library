"use client";
import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8080/api";

type MotorStatus = "open" | "closed";
type BookInCabinet = {
  id: number;
  title: string;
  author: string;
  isbn: string;
  returned_at: string;
  returned_by: string;
};
type ReturnRecord = {
  id: number;
  returned_at: string;
  book: { title: string; isbn: string };
  borrower: { name: string; code: string };
};

export default function DashboardPage() {
  const [capacity, setCapacity] = useState(0);
  const [motorStatus, setMotorStatus] = useState<MotorStatus>("closed");
  const [cabinetOnline, setCabinetOnline] = useState(false);
  const [booksInCabinet, setBooksInCabinet] = useState<BookInCabinet[]>([]);
  const [recentReturns, setRecentReturns] = useState<ReturnRecord[]>([]);
  const [loadingMotor, setLoadingMotor] = useState("");
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [time, setTime] = useState("");
  const [tab, setTab] = useState<"books" | "history">("books");

  const notify = (text: string, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "" }), 3000);
  };

  // เวลาปัจจุบัน
  useEffect(() => {
    const update = () =>
      setTime(new Date().toLocaleTimeString("th-TH", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  const fetchCabinet = useCallback(async () => {
    try {
      const res = await fetch(`${API}/dashboard/cabinet`);
      const data = await res.json();
      setCapacity(data.capacity);
      setMotorStatus(data.motor_status);
      setCabinetOnline(true);
    } catch {
      setCabinetOnline(false);
    }
  }, []);

  const fetchBooksInCabinet = useCallback(async () => {
    try {
      const res = await fetch(`${API}/dashboard/books-in-cabinet`);
      const data = await res.json();
      setBooksInCabinet(data.books || []);
    } catch {}
  }, []);

  const fetchRecentReturns = useCallback(async () => {
    try {
      const res = await fetch(`${API}/dashboard/recent-returns`);
      const data = await res.json();
      setRecentReturns(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  // โหลดข้อมูลตอนเริ่ม + Polling ทุก 5 วินาที
  useEffect(() => {
    fetchCabinet();
    fetchBooksInCabinet();
    fetchRecentReturns();
    const t = setInterval(() => {
      fetchCabinet();
      fetchBooksInCabinet();
      fetchRecentReturns();
    }, 5000);
    return () => clearInterval(t);
  }, [fetchCabinet, fetchBooksInCabinet, fetchRecentReturns]);

  const handleOpenMotor = async () => {
    setLoadingMotor("open");
    try {
      const res = await fetch(`${API}/dashboard/motor/open`, { method: "POST" });
      const data = await res.json();
      setMotorStatus("open");
      notify("🔓 " + data.message);
    } catch { notify("เกิดข้อผิดพลาด", "error"); }
    setLoadingMotor("");
  };

  const handleCloseMotor = async () => {
    setLoadingMotor("close");
    try {
      const res = await fetch(`${API}/dashboard/motor/close`, { method: "POST" });
      const data = await res.json();
      setMotorStatus("closed");
      notify("🔒 " + data.message);
    } catch { notify("เกิดข้อผิดพลาด", "error"); }
    setLoadingMotor("");
  };

  const fmtDate = (d: string) =>
    d ? new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-";

  const capacityColor =
    capacity >= 100 ? "bg-red-500" : capacity >= 70 ? "bg-yellow-400" : "bg-green-500";

  const capacityTextColor =
    capacity >= 100 ? "text-red-600" : capacity >= 70 ? "text-yellow-600" : "text-green-600";

  return (
    <div className="min-h-screen bg-gray-100">

      {/* Header */}
      <div className="bg-blue-900 text-white px-8 py-4 shadow-lg">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-blue-700 rounded-full w-12 h-12 flex items-center justify-center text-2xl">
              🏛️
            </div>
            <div>
              <p className="text-blue-300 text-xs tracking-widest uppercase">Smart Library</p>
              <h1 className="text-xl font-bold">แผงควบคุมพนักงาน</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {msg.text && (
              <div className={`px-4 py-2 rounded-lg text-sm font-semibold ${msg.type === "error" ? "bg-red-500" : "bg-green-500"}`}>
                {msg.text}
              </div>
            )}
            <div className="text-right">
              <p className="text-blue-400 text-xs">เวลาปัจจุบัน</p>
              <p className="font-mono font-bold text-lg">{time}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto">

        {/* Status Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">

          {/* สถานะการเชื่อมต่อ */}
          <div className="bg-white rounded-xl shadow p-5 flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${cabinetOnline ? "bg-green-100" : "bg-red-100"}`}>
              {cabinetOnline ? "✅" : "❌"}
            </div>
            <div>
              <p className="text-gray-400 text-sm">การเชื่อมต่อ</p>
              <p className={`text-lg font-bold ${cabinetOnline ? "text-green-600" : "text-red-600"}`}>
                {cabinetOnline ? "Online" : "Offline"}
              </p>
            </div>
          </div>

          {/* สถานะตู้ */}
          <div className="bg-white rounded-xl shadow p-5 flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${motorStatus === "open" ? "bg-yellow-100" : "bg-blue-100"}`}>
              {motorStatus === "open" ? "🔓" : "🔒"}
            </div>
            <div>
              <p className="text-gray-400 text-sm">สถานะตู้</p>
              <p className={`text-lg font-bold ${motorStatus === "open" ? "text-yellow-600" : "text-blue-700"}`}>
                {motorStatus === "open" ? "เปิดอยู่" : "ปิดอยู่"}
              </p>
            </div>
          </div>

          {/* ความจุ */}
          <div className="bg-white rounded-xl shadow p-5">
            <div className="flex justify-between items-center mb-2">
              <p className="text-gray-400 text-sm">ความจุตู้</p>
              <p className={`text-xl font-bold ${capacityTextColor}`}>{capacity}%</p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${capacityColor}`}
                style={{ width: `${Math.min(capacity, 100)}%` }}
              />
            </div>
            {capacity >= 100 && (
              <p className="text-red-500 text-xs mt-1 font-semibold">⚠️ ตู้เต็ม ต้องนำหนังสือออก</p>
            )}
          </div>
        </div>

        {/* ปุ่มควบคุมมอเตอร์ */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-700 mb-4">🎛️ ควบคุมตู้รับคืน</h2>
          <div className="flex gap-4">
            <button
              onClick={handleOpenMotor}
              disabled={loadingMotor !== "" || motorStatus === "open"}
              className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-lg transition active:scale-95 flex items-center justify-center gap-2"
            >
              {loadingMotor === "open" ? "⏳ กำลังเปิด..." : "🔓 เปิดตู้"}
            </button>
            <button
              onClick={handleCloseMotor}
              disabled={loadingMotor !== "" || motorStatus === "closed"}
              className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-lg transition active:scale-95 flex items-center justify-center gap-2"
            >
              {loadingMotor === "close" ? "⏳ กำลังปิด..." : "🔒 ปิดตู้"}
            </button>
          </div>
          <p className="text-gray-400 text-xs mt-3 text-center">
            ⚠️ กรุณาตรวจสอบให้แน่ใจว่าไม่มีสิ่งกีดขวางก่อนปิดตู้
          </p>
        </div>

        {/* Tab: หนังสือในตู้ / ประวัติการคืน */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="flex border-b">
            <button
              onClick={() => setTab("books")}
              className={`flex-1 py-4 font-semibold transition ${tab === "books" ? "bg-blue-50 text-blue-700 border-b-2 border-blue-700" : "text-gray-500 hover:text-gray-700"}`}
            >
              📦 หนังสือในตู้ ({booksInCabinet.length} เล่ม)
            </button>
            <button
              onClick={() => setTab("history")}
              className={`flex-1 py-4 font-semibold transition ${tab === "history" ? "bg-blue-50 text-blue-700 border-b-2 border-blue-700" : "text-gray-500 hover:text-gray-700"}`}
            >
              🕐 ประวัติการคืนล่าสุด ({recentReturns.length} รายการ)
            </button>
          </div>

          {/* หนังสือในตู้ */}
          {tab === "books" && (
            <div>
              {booksInCabinet.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-4xl mb-2">📭</p>
                  <p>ไม่มีหนังสือในตู้ขณะนี้</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-blue-50 text-blue-900">
                    <tr>
                      {["ชื่อหนังสือ", "ผู้แต่ง", "ISBN", "คืนเมื่อ", "คืนโดย"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {booksInCabinet.map((b, i) => (
                      <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-4 py-3 font-medium text-gray-800">{b.title}</td>
                        <td className="px-4 py-3 text-gray-600">{b.author}</td>
                        <td className="px-4 py-3 font-mono text-gray-400 text-xs">{b.isbn}</td>
                        <td className="px-4 py-3 text-gray-500">{fmtDate(b.returned_at)}</td>
                        <td className="px-4 py-3 text-gray-600">{b.returned_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ประวัติการคืนล่าสุด */}
          {tab === "history" && (
            <div>
              {recentReturns.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-4xl mb-2">📋</p>
                  <p>ยังไม่มีประวัติการคืน</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-blue-50 text-blue-900">
                    <tr>
                      {["ชื่อหนังสือ", "ISBN", "ผู้คืน", "รหัส", "วันที่คืน"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentReturns.map((r, i) => (
                      <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-4 py-3 font-medium text-gray-800">{r.book?.title}</td>
                        <td className="px-4 py-3 font-mono text-gray-400 text-xs">{r.book?.isbn}</td>
                        <td className="px-4 py-3 text-gray-700">{r.borrower?.name}</td>
                        <td className="px-4 py-3 text-gray-400">{r.borrower?.code}</td>
                        <td className="px-4 py-3 text-gray-500">{fmtDate(r.returned_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Auto-refresh indicator */}
        <p className="text-center text-gray-400 text-xs mt-4">
          🔄 ข้อมูลอัปเดตอัตโนมัติทุก 5 วินาที
        </p>
      </div>
    </div>
  );
}