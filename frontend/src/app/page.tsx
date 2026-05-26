"use client";
import { useState, useEffect, useRef } from "react";

const API = "http://localhost:8080/api";

type UserType = "student" | "external";
type Step = "select-user" | "identify" | "check-book" | "drop" | "success";

type Borrower = { id: number; code: string; name: string; type: string };
type Book = { id: number; isbn: string; title: string; author: string };
type BorrowRecord = { id: number; book: Book; due_date: string };

export default function TabletPage() {
  const [step, setStep] = useState<Step>("select-user");
  const [userType, setUserType] = useState<UserType>("student");
  const [inputCode, setInputCode] = useState("");
  const [inputISBN, setInputISBN] = useState("");
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [activeBorrows, setActiveBorrows] = useState<BorrowRecord[]>([]);
  const [capacity, setCapacity] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [time, setTime] = useState("");
  const [motorOpen, setMotorOpen] = useState(false);
  const motorOpenedRef = useRef(false);

  // เวลาปัจจุบัน
  useEffect(() => {
    const update = () =>
      setTime(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  // ดึงสถานะตู้
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API}/status`);
        const data = await res.json();
        setCapacity(data.capacity);
      } catch { }
    };
    fetch_();
    const t = setInterval(fetch_, 3000);
    return () => clearInterval(t);
  }, []);

  // รับสัญญาณจาก Simulator ผ่าน WebSocket
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8080/ws/tablet");

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "barcode") {
        // รับค่า Barcode → ใส่ลง inputCode แล้ว trigger identify
        setInputCode(msg.value);
        setStep((prev) => {
          if (prev === "identify") {
            // trigger handleIdentify อัตโนมัติ
            setTimeout(() => handleIdentifyWithCode(msg.value), 100);
          }
          return prev;
        });
      }

      if (msg.type === "rfid") {
        // รับค่า RFID → ใส่ลง inputISBN แล้ว trigger check
        setInputISBN(msg.value);
        setStep((prev) => {
          if (prev === "check-book") {
            setTimeout(() => handleCheckBookWithISBN(msg.value), 100);
          }
          return prev;
        });
      }
    };

    ws.onerror = () => console.log("WebSocket error");

    return () => ws.close();
  }, []);

  // เปิดตู้เมื่อเข้าหน้าตรวจสอบหนังสือ (step 3) เพียงครั้งเดียว
  useEffect(() => {
    if (step === "check-book" && !motorOpenedRef.current) {
      motorOpenedRef.current = true;
      fetch(`${API}/dashboard/motor/open`, { method: "POST" }).catch(() => {});
    } else if (step !== "check-book") {
      motorOpenedRef.current = false;
    }
  }, [step]);

  const handleSelectUser = (type: UserType) => {
    setUserType(type);
    setInputCode("");
    setErrorMsg("");
    setStep("identify");
  };

  // ขั้นตอน 1: ตรวจสอบตัวตนจาก DB
  const handleIdentify = async () => {
    if (!inputCode.trim()) {
      setErrorMsg(userType === "student" ? "กรุณากรอกรหัสนักศึกษา" : "กรุณากรอกเบอร์โทรศัพท์");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API}/borrower/code/${inputCode.trim()}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "ไม่พบข้อมูลในระบบ");
        setLoading(false);
        return;
      }
      setBorrower(data);

      // ดึงรายการหนังสือที่ยังยืมอยู่
      const borrowRes = await fetch(`${API}/borrows/active/${data.id}`);
      const borrowData = await borrowRes.json();
      setActiveBorrows(borrowData);

      setStep("check-book");
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
    setLoading(false);
  };

  // ขั้นตอน 2: ตรวจสอบหนังสือจาก ISBN
  const handleCheckBook = async () => {
    if (!inputISBN.trim()) {
      setErrorMsg("กรณาวางหนังสือบนช่องรับ");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API}/book/isbn/${inputISBN.trim()}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "ไม่พบหนังสือในระบบ");
        setLoading(false);
        return;
      }
      setBook(data);
      setStep("drop");
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
    setLoading(false);
  };

  // ขั้นตอน 3: ยืนยันหย่อนหนังสือ + บันทึก DB
  const handleDropBook = async () => {
    if (!borrower || !book) return;
    setLoading(true);
    setErrorMsg("");
    try {
      // บันทึกการคืนลง DB
      const res = await fetch(`${API}/borrows/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ borrower_id: borrower.id, book_id: book.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "เกิดข้อผิดพลาด");
        setLoading(false);
        return;
      }

      // แจ้ง Hardware ให้นับความจุ
      await fetch(`${API}/simulate/return-book`, { method: "POST" });

      // ทำการหย่อนหนังสือ: เท (dump) เป็นเวลา 5 วินาที
      await fetch(`${API}/dashboard/motor/dump`, { method: "POST" });

      // รอ 5 วินาที ให้หนังสือหล่นเข้าตู้
      await new Promise(resolve => setTimeout(resolve, 5000));

      // ปิดตู้ (แกนชักยืดสุด) เพื่อรอการเลือกของผู้ใช้
      await fetch(`${API}/dashboard/motor/close`, { method: "POST" });
      setMotorOpen(false);
      setStep("success");
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
    setLoading(false);
  };

  const handleReset = () => {
    // ปิดตู้ถ้ายังเปิดอยู่
    if (motorOpen) {
      fetch(`${API}/dashboard/motor/close`, { method: "POST" }).catch(() => {});
    }
    motorOpenedRef.current = false;
    setStep("select-user");
    setInputCode("");
    setInputISBN("");
    setBorrower(null);
    setBook(null);
    setActiveBorrows([]);
    setErrorMsg("");
    setMotorOpen(false);
  };

  // แยกออกมาเพื่อให้ WebSocket เรียกได้
  const handleIdentifyWithCode = async (code: string) => {
    if (!code.trim()) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API}/borrower/code/${code.trim()}`);
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error); setLoading(false); return; }
      setBorrower(data);
      const borrowRes = await fetch(`${API}/borrows/active/${data.id}`);
      setActiveBorrows(await borrowRes.json());
      setStep("check-book");
    } catch { setErrorMsg("เกิดข้อผิดพลาด"); }
    setLoading(false);
  };

  const handleCheckBookWithISBN = async (isbn: string) => {
    if (!isbn.trim()) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API}/book/isbn/${isbn.trim()}`);
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error); setLoading(false); return; }
      setBook(data);
      setStep("drop");
    } catch { setErrorMsg("เกิดข้อผิดพลาด"); }
    setLoading(false);
  };

  const steps = [
    { key: "select-user", label: "เลือกประเภท" },
    { key: "identify", label: "ระบุตัวตน" },
    { key: "check-book", label: "ตรวจสอบหนังสือ" },
    { key: "drop", label: "หย่อนหนังสือ" },
    { key: "success", label: "เสร็จสิ้น" },
  ];
  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 to-blue-900 flex flex-col select-none">

      {/* Header */}
      <div className="bg-blue-950 px-8 py-4 flex justify-between items-center border-b border-blue-800 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="bg-white rounded-full w-12 h-12 flex items-center justify-center p-1">
            <img src="/images/LOGO-RUTS-07-2-copy.png" alt="RUTS Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-blue-300 text-xs tracking-widest uppercase">Book Return Station</p>
            <h1 className="text-white text-lg font-bold">ระบบรับคืนหนังสืออัตโนมัติ</h1>
          </div>
        </div>
        <div className="text-right">
          <p className="text-blue-400 text-xs">เวลาปัจจุบัน</p>
          <p className="text-white text-2xl font-mono font-bold">{time}</p>
          <div className="flex items-center gap-2 mt-1 justify-end">
            <div className={`w-2 h-2 rounded-full ${motorOpen ? "bg-yellow-400 animate-pulse" : capacity >= 100 ? "bg-red-400" : "bg-green-400"}`} />
            <p className={`text-xs ${motorOpen ? "text-yellow-300" : capacity >= 100 ? "text-red-300" : "text-green-300"}`}>
              {motorOpen ? "ตู้เปิดอยู่" : capacity >= 100 ? "ตู้เต็ม" : `ความจุ ${capacity}%`}
            </p>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex justify-center items-center gap-0 py-4 bg-blue-950 border-b border-blue-800 flex-wrap">
        {steps.map((s, i) => {
          const isDone = i < currentStepIndex;
          const isActive = i === currentStepIndex;
          return (
            <div key={s.key} className="flex items-center">
              <div className={`flex items-center gap-1 px-3 py-2 rounded-full text-xs font-semibold transition-all
                ${isActive ? "bg-white text-blue-900 shadow-lg" : isDone ? "bg-blue-500 text-white" : "bg-blue-800 text-blue-500"}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold
                  ${isActive ? "bg-blue-900 text-white" : isDone ? "bg-white text-blue-600" : "bg-blue-700 text-blue-400"}`}>
                  {isDone ? "✓" : i + 1}
                </span>
                {s.label}
              </div>
              {i < steps.length - 1 && <div className={`w-4 h-0.5 ${i < currentStepIndex ? "bg-blue-500" : "bg-blue-800"}`} />}
            </div>
          );
        })}
      </div>

      {/* Main Card */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10">

          {/* ขั้นตอน 1: เลือกประเภทผู้ใช้ */}
          {step === "select-user" && (
            <div className="text-center">
              <h2 className="text-2xl font-bold text-blue-900 mb-2">ยินดีต้อนรับ</h2>
              <p className="text-gray-500 mb-8">กรุณาเลือกประเภทผู้ใช้งาน</p>
              <div className="flex flex-col gap-4">
                <button onClick={() => handleSelectUser("student")}
                  className="w-full bg-blue-700 hover:bg-blue-800 active:scale-95 text-white font-bold py-6 rounded-2xl text-lg transition-all shadow-md flex items-center justify-center gap-3">
                  <span className="text-3xl">🎓</span>
                  <div className="text-left">
                    <p className="font-bold">นักศึกษา / บุคลากร</p>
                    <p className="text-blue-200 text-sm font-normal">ใช้รหัสนักศึกษา / รหัสพนักงาน</p>
                  </div>
                </button>
                <button onClick={() => handleSelectUser("external")}
                  className="w-full bg-white hover:bg-gray-50 active:scale-95 text-blue-900 font-bold py-6 rounded-2xl text-lg transition-all shadow-md border-2 border-blue-200 flex items-center justify-center gap-3">
                  <span className="text-3xl">👤</span>
                  <div className="text-left">
                    <p className="font-bold">บุคคลภายนอก</p>
                    <p className="text-gray-400 text-sm font-normal">ใช้เบอร์โทรศัพท์</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ขั้นตอน 2: ระบุตัวตน */}
          {step === "identify" && (
            <div className="text-center">
              <div className="text-5xl mb-4">{userType === "student" ? "🪪" : "📱"}</div>
              <h2 className="text-2xl font-bold text-blue-900 mb-2">
                {userType === "student" ? "สแกนบัตรนักศึกษา" : "กรอกเบอร์โทรศัพท์"}
              </h2>
              <p className="text-gray-400 text-sm mb-6">ระบบจะตรวจสอบข้อมูลของคุณในฐานข้อมูล</p>
              <input
                type="text"
                placeholder={userType === "student" ? "เช่น 166403230001" : "เช่น 0812345678"}
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleIdentify()}
                className="w-full border-2 border-blue-200 rounded-xl px-4 py-4 text-xl text-center tracking-widest mb-2 focus:outline-none focus:border-blue-500 text-gray-800"
                autoFocus
              />
              {errorMsg && <p className="text-red-500 text-sm mb-3">{errorMsg}</p>}
              <button onClick={handleIdentify} disabled={loading}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl text-lg transition mt-2">
                {loading ? "⏳ กำลังตรวจสอบ..." : "ยืนยัน →"}
              </button>
              <button onClick={handleReset} className="w-full mt-3 text-gray-400 hover:text-gray-600 text-sm py-2">← ย้อนกลับ</button>
            </div>
          )}

          {/* ขั้นตอน 3: ตรวจสอบหนังสือ */}
          {step === "check-book" && (
            <div className="text-center">
              <div className="text-5xl mb-3">📖</div>
              <h2 className="text-2xl font-bold text-blue-900 mb-1">ตรวจสอบหนังสือ</h2>

              {/* แสดงข้อมูลผู้ยืม */}
              <div className="bg-blue-50 rounded-xl p-3 mb-4 border border-blue-100 text-left">
                <p className="text-blue-400 text-xs">ผู้คืนหนังสือ</p>
                <p className="text-blue-900 font-bold">{borrower?.name}</p>
                <p className="text-blue-500 text-sm">{borrower?.code}</p>
              </div>

              {/* รายการหนังสือที่ยังยืมอยู่ */}
              {activeBorrows.length > 0 && (
                <div className="bg-yellow-50 rounded-xl p-3 mb-4 border border-yellow-200 text-left">
                  <p className="text-yellow-700 text-xs font-semibold mb-2">📋 หนังสือที่ยังยืมอยู่ ({activeBorrows.length} เล่ม)</p>
                  {activeBorrows.map((r) => (
                    <div key={r.id} className="text-sm text-gray-700 py-1 border-b border-yellow-100 last:border-0">
                      <p className="font-medium">{r.book?.title}</p>
                      <p className="text-gray-400 text-xs">กำหนดคืน: {new Date(r.due_date).toLocaleDateString("th-TH")}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeBorrows.length === 0 && (
                <div className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-200">
                  <p className="text-gray-400 text-sm">ไม่พบรายการยืมหนังสือในระบบ</p>
                </div>
              )}

              <p className="text-gray-500 text-sm mb-3">กรอก ISBN ของหนังสือที่ต้องการคืน</p>
              <input
                type="text"
                placeholder="ISBN เช่น 978-XXXXXXXXXX"
                value={inputISBN}
                onChange={(e) => setInputISBN(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCheckBook()}
                className="w-full border-2 border-blue-200 rounded-xl px-4 py-4 text-lg text-center tracking-widest mb-2 focus:outline-none focus:border-blue-500 text-gray-800"
                autoFocus
              />
              {errorMsg && <p className="text-red-500 text-sm mb-3">{errorMsg}</p>}
              <button onClick={handleCheckBook} disabled={loading}
                className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl text-lg transition">
                {loading ? "⏳ กำลังตรวจสอบ..." : "ตรวจสอบหนังสือ →"}
              </button>
              <button onClick={handleReset} className="w-full mt-3 text-gray-400 hover:text-gray-600 text-sm py-2">← ยกเลิก</button>
            </div>
          )}

          {/* ขั้นตอน 4: หย่อนหนังสือ */}
          {step === "drop" && (
            <div className="text-center">
              <div className="text-6xl mb-4 animate-bounce">📥</div>
              <h2 className="text-2xl font-bold text-blue-900 mb-4">ดำเนินการคืนหนังสือเข้าตู้</h2>

              {/* ข้อมูลหนังสือที่ตรวจสอบแล้ว */}
              <div className="bg-green-50 rounded-xl p-4 mb-4 border border-green-200 text-left">
                <p className="text-green-600 text-xs font-semibold mb-1">✅ คืนหนังสือ</p>
                <p className="text-gray-800 font-bold">{book?.title}</p>
                <p className="text-gray-500 text-sm">{book?.author}</p>
                <p className="text-gray-400 text-xs mt-1">ISBN: {book?.isbn}</p>
              </div>

              <div className="bg-yellow-50 rounded-xl p-3 mb-5 border border-yellow-200">
                <p className="text-yellow-700 text-sm font-medium">🔓 ตู้เปิดอยู่ — กรุณากดยืนยันเพื่อคืนหนังสือ</p>
              </div>

              {errorMsg && <p className="text-red-500 text-sm mb-3">{errorMsg}</p>}
              <button onClick={handleDropBook} disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-5 rounded-xl text-xl transition shadow-lg active:scale-95">
                {loading ? "⏳ กำลังบันทึก..." : "✅ ดำเนินการคืนหนังสือ"}
              </button>
              <button onClick={handleReset} className="w-full mt-4 text-gray-400 hover:text-gray-600 text-sm py-2">← ยกเลิก</button>
            </div>
          )}

          {/* ขั้นตอน 5: สำเร็จ */}
          {step === "success" && (
            <div className="text-center">
              <div className="text-7xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-green-700 mb-2">
                คืนหนังสือสำเร็จ!
              </h2>
              <p className="text-gray-500 mb-4">บันทึกลงฐานข้อมูลเรียบร้อยแล้ว</p>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-left">
                <p className="text-green-600 text-xs font-semibold mb-2">✅ รายละเอียดการคืน</p>
                <p className="text-gray-700"><span className="text-gray-400 text-sm">ผู้คืน: </span>{borrower?.name}</p>
                <p className="text-gray-700"><span className="text-gray-400 text-sm">หนังสือ: </span>{book?.title}</p>
                <p className="text-gray-700"><span className="text-gray-400 text-sm">เวลา: </span>{new Date().toLocaleString("th-TH")}</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-6 text-center">
                <p className="text-blue-700 text-xs font-semibold">🔒 สถานะตู้: ปิดอยู่</p>
                <p className="text-blue-500 text-xs">รอการเลือกของผู้ใช้</p>
              </div>

              <div className="flex flex-col gap-3">
                {/* ← ปุ่มใหม่: คืนเล่มถัดไปโดยคนเดิม */}
                <button
                  onClick={() => {
                    setBook(null);
                    setInputISBN("");
                    setErrorMsg("");
                    setStep("check-book"); // ← ข้ามไปขั้นตอนกรอก ISBN เลย
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl text-lg transition active:scale-95"
                >
                  📚 คืนเล่มถัดไป
                </button>

                {/* ปุ่มเดิม: เริ่มใหม่ทั้งหมด */}
                <button
                  onClick={handleReset}
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-4 rounded-xl text-lg transition active:scale-95"
                >
                  ✅ เสร็จสิ้น
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      <div className="text-center py-3 text-blue-600 text-xs border-t border-blue-800">
        หากพบปัญหา กรุณาติดต่อบรรณารักษ์ที่เคาน์เตอร์
      </div>
    </div>
  );
}