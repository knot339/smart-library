"use client";
import { useState, useEffect, useRef } from "react";

import SrivijayaPattern from "../components/SrivijayaPattern";
import { Step, Borrower, Book, BorrowRecord } from "../types";
import { API_BASE_URL as API, WS_BASE_URL } from "../lib/config";

export default function TabletPage() {
  const [step, setStep] = useState<Step>("select-user");
  const [inputCode, setInputCode] = useState("");
  const [inputBarcode, setInputBarcode] = useState("");
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [booksToReturn, setBooksToReturn] = useState<Book[]>([]);
  const [activeBorrows, setActiveBorrows] = useState<any[]>([]);
  const [capacity, setCapacity] = useState(0);
  const [isFull, setIsFull] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [time, setTime] = useState("");
  const [motorOpen, setMotorOpen] = useState(false);
  const motorOpenedRef = useRef(false);


  // อัปเดตเวลาปัจจุบันเพื่อแสดงผลบนหน้าจอ
  useEffect(() => {
    const update = () =>
      setTime(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  // ดึงข้อมูลสถานะและปริมาณความจุของตู้รับคืนหนังสือจากเซิร์ฟเวอร์
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API}/status`);
        const data = await res.json();
        setCapacity(data.capacity);
        setIsFull(data.is_full);
        // อัปเดตสถานะการทำงานของมอเตอร์จากข้อมูลที่ได้รับจากเซิร์ฟเวอร์
        setMotorOpen(data.motor_status === "open" || data.motor_status === "dump");
      } catch { }
    };
    fetch_();
    const t = setInterval(fetch_, 3000);
    return () => clearInterval(t);
  }, []);

  // เชื่อมต่อและจัดการข้อมูลการส่งสัญญาณจากระบบจำลอง (Simulator) ผ่าน WebSocket
  useEffect(() => {
    const ws = new WebSocket(WS_BASE_URL);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "barcode") {
        // จัดการเมื่อได้รับข้อมูลประเภท Barcode เพื่อระบุตัวตนผู้ใช้งาน
        setInputCode(msg.value);
        setStep((prev) => {
          if (prev === "identify") {
            // ประมวลผลและยืนยันตัวตนอัตโนมัติเมื่อได้รับข้อมูลที่ถูกต้อง
            setTimeout(() => handleIdentifyWithCode(msg.value), 100);
          }
          return prev;
        });
      }

      if (msg.type === "rfid") {
        // จัดการเมื่อได้รับข้อมูลประเภท RFID เพื่อตรวจสอบข้อมูลของหนังสือ
        setInputBarcode(msg.value);
        setStep((prev) => {
          if (prev === "check-book") {
            setTimeout(() => handleCheckBookWithBarcode(msg.value), 100);
          }
          return prev;
        });
      }
    };

    ws.onerror = () => console.log("WebSocket error");

    return () => ws.close();
  }, []);

  // สั่งการเปิดตู้รับคืนเพียงครั้งเดียวเมื่อผู้ใช้งานเข้าสู่ขั้นตอนการตรวจสอบหนังสือ (ขั้นตอนที่ 3)
  useEffect(() => {
    if (step === "check-book" && !motorOpenedRef.current) {
      motorOpenedRef.current = true;
      fetch(`${API}/dashboard/motor/open`, { method: "POST" }).catch(() => { });
      setMotorOpen(true);
    } else if (step !== "check-book") {
      motorOpenedRef.current = false;
    }
  }, [step]);

  // สั่งการปิดตู้รับคืนเมื่อผู้ใช้งานย้อนกลับไปยังหน้าเริ่มต้น (หากตู้กำลังเปิดอยู่)
  useEffect(() => {
    if (step === "select-user" && motorOpen) {
      fetch(`${API}/dashboard/motor/close`, { method: "POST" }).catch(() => { });
      setMotorOpen(false);
    }
  }, [step, motorOpen]);

  // ขั้นตอนที่ 1: ตรวจสอบข้อมูลเพื่อยืนยันตัวตนของผู้ใช้งานจากฐานข้อมูล
  const handleIdentify = async () => {
    if (!inputCode.trim()) {
      setErrorMsg("กรุณากรอกรหัสนักศึกษา เบอร์โทร หรือบัตรประชาชน");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API}/borrower/code/${inputCode.trim()}`);
      const data = await res.json();
      if (!res.ok) {
        // กรณีไม่พบข้อมูลผู้ใช้งาน: ตรวจสอบรูปแบบข้อมูลว่าเป็นหมายเลขโทรศัพท์หรือไม่
        if (inputCode.match(/^0\d{9}$/)) {
          // กรณีข้อมูลเป็นหมายเลขโทรศัพท์: ดำเนินการสร้างบัญชีผู้ใช้งานทั่วไป (Guest)
          try {
            const createRes = await fetch(`${API}/borrowers`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: inputCode.trim(),
                name: "ผู้มาคืนหนังสือ",
                phone: inputCode.trim(),
                type: "guest"
              })
            });
            const newBorrower = await createRes.json();
            if (createRes.ok) {
              setBorrower(newBorrower);
              setActiveBorrows([]);
              setStep("check-book");
            } else {
              setErrorMsg(newBorrower.error || "ไม่สามารถบันทึกข้อมูลได้");
            }
          } catch {
            setErrorMsg("เกิดข้อผิดพลาด ไม่สามารถสร้าง guest borrower");
          }
        } else {
          setErrorMsg("ไม่พบข้อมูล กรุณาใส่เลขโทรศัพท์");
        }
        setLoading(false);
        return;
      }
      setBorrower(data);

      // ดึงข้อมูลรายการหนังสือที่ผู้ใช้งานรายดังกล่าวยังคงทำการยืมอยู่
      const borrowRes = await fetch(`${API}/patron/${data.code}/borrows`);
      const borrowData = await borrowRes.json();
      setActiveBorrows(borrowData);

      setStep("check-book");
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
    setLoading(false);
  };

  // ขั้นตอนที่ 2: ตรวจสอบข้อมูลรายละเอียดของหนังสือโดยใช้รหัส Barcode
  const handleCheckBook = async () => {
    if (!inputBarcode.trim()) {
      setErrorMsg("กรณาวางหนังสือบนช่องรับ");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API}/book/barcode/${inputBarcode.trim()}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "ไม่พบหนังสือในระบบ");
        setLoading(false);
        return;
      }
      if (booksToReturn.some(b => b.id === data.id)) {
        setErrorMsg("สแกนหนังสือเล่มนี้ไปแล้ว");
        setLoading(false);
        return;
      }
      setBooksToReturn(prev => [...prev, data]);
      setInputBarcode(""); // เคลียร์ช่องให้พร้อมสแกนเล่มถัดไป
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
    setLoading(false);
  };

  // ขั้นตอนที่ 3: ดำเนินการคืนหนังสือเข้าตู้ พร้อมบันทึกข้อมูลการคืนลงในฐานข้อมูล
  const handleDropBook = async () => {
    if (!borrower || booksToReturn.length === 0) return;
    setLoading(true);
    setErrorMsg("");
    try {
      // วนลูปบันทึกข้อมูลการคืนหนังสือทุกลงในระบบฐานข้อมูล
      for (const b of booksToReturn) {
        const res = await fetch(`${API}/borrows/return`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            book_id: b.id,
            borrower_id: borrower?.id,
            returned_by_phone: borrower?.phone || ""
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setErrorMsg(data.error || `เกิดข้อผิดพลาดในการคืนหนังสือ ${b.title}`);
          setLoading(false);
          return;
        }
      }

      // ส่งสัญญาณไปยังระบบฮาร์ดแวร์เพื่อดำเนินการคำนวณและอัปเดตความจุของตู้รับคืน
      await fetch(`${API}/simulate/return-book`, { method: "POST" });

      // สั่งการให้ระบบฮาร์ดแวร์ดำเนินการเทหนังสือ (Dump) ลงในตู้จัดเก็บ
      await fetch(`${API}/dashboard/motor/dump`, { method: "POST" });

      // หน่วงเวลา 5 วินาที เพื่อให้แน่ใจว่าหนังสือตกลงในตู้จัดเก็บอย่างสมบูรณ์
      await new Promise(resolve => setTimeout(resolve, 5000));

      // สั่งการปิดตู้รับคืน (ยืดแกนชักจนสุด) เพื่อเตรียมความพร้อมสำหรับการทำรายการครั้งต่อไป
      await fetch(`${API}/dashboard/motor/close`, { method: "POST" });
      setMotorOpen(false);
      setStep("success");
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
    setLoading(false);
  };

  const handleReset = () => {
    // ดำเนินการปิดตู้รับคืนหากยังเปิดอยู่ พร้อมทั้งรีเซ็ตข้อมูลการทำรายการทั้งหมด
    if (motorOpen) {
      fetch(`${API}/dashboard/motor/close`, { method: "POST" }).catch(() => { });
    }
    motorOpenedRef.current = false;
    setStep("select-user");
    setInputCode("");
    setInputBarcode("");
    setBorrower(null);
    setBooksToReturn([]);
    setActiveBorrows([]);
    setErrorMsg("");
    setMotorOpen(false);
  };

  // ฟังก์ชันแยกสำหรับการตรวจสอบตัวตนผู้ใช้งาน (รองรับการเรียกใช้งานผ่าน WebSocket)
  const handleIdentifyWithCode = async (code: string) => {
    if (!code.trim()) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API}/borrower/code/${code.trim()}`);
      const data = await res.json();
      if (!res.ok) { setErrorMsg("ไม่พบข้อมูล กรุณาใส่เลขโทรศัพท์"); setLoading(false); return; }
      setBorrower(data);
      const borrowRes = await fetch(`${API}/patron/${data.code}/borrows`);
      setActiveBorrows(await borrowRes.json());
      setStep("check-book");
    } catch { setErrorMsg("เกิดข้อผิดพลาด"); }
    setLoading(false);
  };

  const handleCheckBookWithBarcode = async (barcode: string) => {
    if (!barcode.trim()) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API}/book/barcode/${barcode.trim()}`);
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error); setLoading(false); return; }
      if (booksToReturn.some(b => b.id === data.id)) {
        setErrorMsg("สแกนหนังสือเล่มนี้ไปแล้ว");
        setLoading(false);
        return;
      }
      setBooksToReturn(prev => [...prev, data]);
      setInputBarcode("");
    } catch { setErrorMsg("เกิดข้อผิดพลาด"); }
    setLoading(false);
  };

  const steps = [
    { key: "select-user", label: "เริ่มต้น" }, // เปลี่ยนจากคำว่า "เลือกผู้ใช้" เป็น "เริ่มต้น" เพื่อความเข้าใจที่ง่ายขึ้น
    { key: "identify", label: "ระบุตัวตน" },
    { key: "check-book", label: "ตรวจสอบหนังสือ" },
    { key: "drop", label: "หย่อนหนังสือ" },
    { key: "success", label: "เสร็จสิ้น" },
  ];
  const currentStepIndex = steps.findIndex((s) => s.key === step);



  // ตรวจสอบและแสดงผลหน้าจอแจ้งเตือน ในกรณีที่ความจุของตู้รับคืนหนังสือเต็ม
  if (isFull) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 to-blue-900 flex flex-col relative">
        <SrivijayaPattern />
        <div className="relative z-10 flex flex-col flex-1">

          {/* Header */}
          <div className="bg-blue-950 px-8 py-4 flex justify-between items-center border-b border-blue-800">
            <div className="flex items-center gap-4">
              <div className="bg-blue-700 rounded-full w-12 h-12 flex items-center justify-center text-2xl">📚</div>
              <div>
                <p className="text-blue-300 text-xs tracking-widest uppercase">Book Return Station</p>
                <h1 className="text-white text-lg font-bold">ระบบรับคืนหนังสืออัตโนมัติ</h1>
              </div>
            </div>
            <div className="text-right">
              <p className="text-blue-400 text-xs">เวลาปัจจุบัน</p>
              <p className="text-white text-2xl font-mono font-bold">{time}</p>
            </div>
          </div>

          {/* ส่วนแสดงหน้าจอแจ้งเตือนเมื่อตู้รับคืนหนังสือเต็ม */}
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 text-center">

              {/* ไอคอนแจ้งเตือน */}
              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-5xl">🚫</span>
              </div>

              <h2 className="text-2xl font-bold text-red-600 mb-3">
                ขออภัย — ตู้เต็มแล้ว
              </h2>

              <p className="text-gray-600 mb-2 text-lg">
                ขณะนี้ตู้รับคืนหนังสือเต็มแล้ว
              </p>
              <p className="text-gray-500 text-sm mb-6">
                ไม่สามารถรับคืนหนังสือได้ในขณะนี้
              </p>

              {/* ส่วนแสดงคำแนะนำการดำเนินการสำหรับผู้ใช้งาน */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
                <p className="text-blue-700 font-semibold text-sm mb-2">📋 กรุณาดำเนินการดังนี้</p>
                <ul className="text-blue-600 text-sm space-y-1">
                  <li>• ติดต่อบรรณารักษ์ที่เคาน์เตอร์</li>
                  <li>• คืนหนังสือที่เคาน์เตอร์บริการโดยตรง</li>
                  <li>• รอจนกว่าเจ้าหน้าที่จะเคลียร์ตู้</li>
                </ul>
              </div>

              {/* ข้อความแจ้งเตือนเกี่ยวกับการอัปเดตสถานะอัตโนมัติของระบบ */}
              <p className="text-gray-400 text-xs">
                🔄 ระบบจะอัปเดตสถานะอัตโนมัติทุก 3 วินาที
                <br />หน้านี้จะกลับสู่ปกติเมื่อตู้มีพื้นที่ว่าง
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="relative z-10 text-center py-3 text-white text-xs bg-blue-950 border-t border-blue-800">
            หากพบปัญหา กรุณาติดต่อบรรณารักษ์ที่เคาน์เตอร์
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 to-blue-900 flex flex-col select-none relative">
      <SrivijayaPattern />
      <div className="relative z-10 flex flex-col flex-1">

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
              <div className={`w-2 h-2 rounded-full ${motorOpen ? "bg-yellow-400 animate-pulse" : isFull ? "bg-red-400" : "bg-green-400"}`} />
              <p className={`text-xs ${motorOpen ? "text-yellow-300" : isFull ? "text-red-300" : "text-green-300"}`}>
                {motorOpen ? "ตู้เปิดอยู่" : isFull ? "ตู้เต็ม" : "ตู้ว่าง"}
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

            {/* ขั้นตอนที่ 1: หน้าจอเริ่มต้นระบบการรับคืนหนังสือ */}
            {step === "select-user" && (
              <div className="text-center">
                <div className="text-7xl mb-6 soft-bounce">📚</div>
                <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-900 mb-3">ยินดีต้อนรับ</h2>
                <p className="text-gray-600 mb-2 text-lg font-semibold">ระบบรับคืนหนังสืออัตโนมัติ</p>
                <p className="text-gray-400 mb-12 text-sm">Smart Library Return Station</p>
                <button onClick={() => { setStep("identify"); setInputCode(""); setErrorMsg(""); }}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 active:scale-95 text-white font-bold py-8 rounded-3xl text-4xl transition-all shadow-2xl transform hover:shadow-3xl">
                  เริ่มต้น
                </button>
                <p className="text-gray-400 text-xs mt-8">กรุณากดปุ่มเพื่อเริ่มกระบวนการคืนหนังสือ</p>
              </div>
            )}

            {/* ขั้นตอนที่ 2: หน้าจอสำหรับการกรอกข้อมูลเพื่อระบุตัวตนผู้ใช้งาน */}
            {step === "identify" && (
              <div className="text-center">
                <div className="text-5xl mb-4">🪪</div>
                <h2 className="text-2xl font-bold text-blue-900 mb-2">ระบุตัวตน</h2>
                <p className="text-gray-400 text-sm mb-6">กรุณากรอกรหัส บัตรนักศึกษา หรือเบอร์โทร</p>
                <input
                  type="text"
                  placeholder="รหัศนักศึกษา หรือ เบอร์โทร"
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

            {/* ขั้นตอนที่ 3: หน้าจอสำหรับการสแกนและตรวจสอบข้อมูลหนังสือ */}
            {step === "check-book" && (
              <div className="text-center">
                <div className="text-5xl mb-3">📖</div>
                <h2 className="text-2xl font-bold text-blue-900 mb-1">ตรวจสอบหนังสือ</h2>

                {/* ส่วนแสดงรายละเอียดข้อมูลของผู้ใช้งานที่กำลังทำรายการ */}
                <div className="bg-blue-50 rounded-xl p-3 mb-4 border border-blue-100 text-left">
                  <p className="text-blue-400 text-xs">ผู้คืนหนังสือ</p>
                  <p className="text-blue-900 font-bold">{borrower?.name}</p>
                  <p className="text-blue-500 text-sm">{borrower?.code}</p>
                  {borrower?.phone && (
                    <p className="text-blue-400 text-xs mt-2">📱 เบอร์โทร: <span className="font-semibold">{borrower.phone}</span></p>
                  )}
                </div>

                {/* ส่วนแสดงรายการหนังสือที่ผู้ใช้งานรายนี้ยังคงค้างส่ง */}
                {activeBorrows.length > 0 && (
                  <div className="bg-yellow-50 rounded-xl p-3 mb-4 border border-yellow-200 text-left">
                    <p className="text-yellow-700 text-xs font-semibold mb-2">📋 หนังสือที่ยังยืมอยู่ ({activeBorrows.length} เล่ม)</p>
                    {activeBorrows.map((r, idx) => (
                      <div key={r.NO || idx} className="text-sm text-gray-700 py-1 border-b border-yellow-100 last:border-0">
                        <p className="font-medium">{r.TITLE}</p>
                        <p className="text-gray-400 text-xs">กำหนดคืน: {r.DUEDATE}</p>
                      </div>
                    ))}
                  </div>
                )}

                {activeBorrows.length === 0 && (
                  <div className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-200">
                    <p className="text-gray-400 text-sm">ไม่พบรายการยืมหนังสือในระบบ</p>
                  </div>
                )}

                {/* ส่วนแสดงรายการหนังสือที่สแกนเพื่อเตรียมคืน */}
                {booksToReturn.length > 0 && (
                  <div className="bg-green-50 rounded-xl p-3 mb-4 border border-green-200 text-left">
                    <p className="text-green-700 font-semibold text-sm mb-2">✅ หนังสือที่สแกนแล้ว ({booksToReturn.length} เล่ม)</p>
                    {booksToReturn.map(b => (
                      <div key={b.id} className="text-sm text-gray-800 py-1 border-b border-green-100 flex justify-between items-center last:border-0">
                        <span className="truncate pr-2">{b.title}</span>
                        <button onClick={() => setBooksToReturn(booksToReturn.filter(x => x.id !== b.id))} className="text-red-500 font-bold hover:bg-red-100 px-2 py-1 rounded text-xs">ลบ</button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-gray-500 text-sm mb-3">กรอก Barcode ของหนังสือที่ต้องการคืน</p>
                <input
                  type="text"
                  placeholder="Barcode หรือ รหัสหนังสือ"
                  value={inputBarcode}
                  onChange={(e) => setInputBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCheckBook()}
                  className="w-full border-2 border-blue-200 rounded-xl px-4 py-4 text-lg text-center tracking-widest mb-2 focus:outline-none focus:border-blue-500 text-gray-800"
                  autoFocus
                />
                {errorMsg && <p className="text-red-500 text-sm mb-3">{errorMsg}</p>}
                <div className="flex gap-2">
                  <button onClick={handleCheckBook} disabled={loading || !inputBarcode.trim()}
                    className="flex-1 bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold py-3 rounded-xl transition disabled:opacity-50">
                    {loading ? "⏳..." : "+ สแกนเพิ่ม"}
                  </button>
                  <button onClick={() => setStep("drop")} disabled={booksToReturn.length === 0}
                    className="flex-[2] bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-lg transition">
                    ดำเนินการคืน ({booksToReturn.length} เล่ม) →
                  </button>
                </div>
                <button onClick={handleReset} className="w-full mt-3 text-gray-400 hover:text-gray-600 text-sm py-2">← ยกเลิกและกลับหน้าแรก</button>
              </div>
            )}

            {/* ขั้นตอนที่ 4: หน้าจอแนะนำและยืนยันการคืนหนังสือเข้าตู้ */}
            {step === "drop" && (
              <div className="text-center">
                <div className="text-6xl mb-4 animate-bounce">📥</div>
                <h2 className="text-2xl font-bold text-blue-900 mb-4">ดำเนินการคืนหนังสือเข้าตู้</h2>

                {/* ส่วนแสดงรายละเอียดข้อมูลของหนังสือที่ได้รับการตรวจสอบแล้ว */}
                <div className="max-h-48 overflow-y-auto mb-4">
                  {booksToReturn.map(b => (
                    <div key={b.id} className="bg-green-50 rounded-xl p-4 mb-2 border border-green-200 text-left">
                      <p className="text-green-600 text-xs font-semibold mb-1">✅ เตรียมคืน</p>
                      <p className="text-gray-800 font-bold">{b.title}</p>
                      <p className="text-gray-500 text-sm">{b.author}</p>
                      <p className="text-gray-400 text-xs mt-1">Barcode: {b.barcode}</p>
                    </div>
                  ))}
                </div>

                {/* ส่วนแสดงรายการหนังสือเล่มอื่น ๆ ที่ผู้ใช้งานรายนี้ยังคงค้างส่ง */}
                {activeBorrows.length > 0 && (
                  <div className="bg-yellow-50 rounded-xl p-4 mb-4 border border-yellow-200 text-left">
                    <p className="text-yellow-700 text-xs font-semibold mb-2">📚 หนังสือที่ยังไม่คืน ({activeBorrows.length} เล่ม)</p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {activeBorrows.map((r, idx) => (
                        <div key={r.NO || idx} className="text-sm text-gray-700 pb-2 border-b border-yellow-100 last:border-0">
                          <p className="font-medium">{r.TITLE}</p>
                          <p className="text-gray-500 text-xs">กำหนดคืน: {r.DUEDATE}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-yellow-50 rounded-xl p-3 mb-5 border border-yellow-200">
                  <p className="text-yellow-700 text-sm font-medium">🔓 ตู้เปิดอยู่ — กรุณากดยืนยันเพื่อคืนหนังสือ</p>
                </div>

                {errorMsg && <p className="text-red-500 text-sm mb-3">{errorMsg}</p>}
                <button onClick={handleDropBook} disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-5 rounded-xl text-xl transition shadow-lg active:scale-95">
                  {loading ? "⏳ กำลังบันทึก..." : "✅ ดำเนินการคืนหนังสือ"}
                </button>
                <button onClick={() => setStep("check-book")} className="w-full mt-4 text-gray-400 hover:text-gray-600 text-sm py-2">← ยกเลิก</button>
              </div>
            )}

            {/* ขั้นตอนที่ 5: หน้าจอแสดงผลลัพธ์การทำรายการคืนหนังสือสำเร็จ */}
            {step === "success" && (
              <div className="text-center">
                <div className="text-7xl mb-4">🎉</div>
                <h2 className="text-2xl font-bold text-green-700 mb-2">
                  คืนหนังสือสำเร็จ!
                </h2>
                <p className="text-gray-500 mb-4">บันทึกลงฐานข้อมูลเรียบร้อยแล้ว</p>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-left max-h-40 overflow-y-auto">
                  <p className="text-green-600 text-xs font-semibold mb-2">✅ รายละเอียดการคืน</p>
                  <p className="text-gray-700"><span className="text-gray-400 text-sm">ผู้คืน: </span>{borrower?.name}</p>
                  <p className="text-gray-700"><span className="text-gray-400 text-sm">จำนวน: </span>{booksToReturn.length} เล่ม</p>
                  <div className="pl-4 border-l-2 border-green-200 my-2">
                    {booksToReturn.map((b, i) => <p key={i} className="text-gray-700 text-sm truncate">{b.title}</p>)}
                  </div>
                  <p className="text-gray-700"><span className="text-gray-400 text-sm">เวลา: </span>{new Date().toLocaleString("th-TH")}</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-6 text-center">
                  <p className="text-blue-700 text-xs font-semibold">🔒 สถานะตู้: ปิดอยู่</p>
                  <p className="text-blue-500 text-xs">รอการเลือกของผู้ใช้</p>
                </div>

                <div className="flex flex-col gap-3">
                  {/* ปุ่มคำสั่งสำหรับการดำเนินการคืนหนังสือเล่มถัดไป ด้วยข้อมูลผู้ใช้งานเดิม */}
                  <button
                    onClick={() => {
                      setBooksToReturn([]);
                      setInputBarcode("");
                      setErrorMsg("");
                      setStep("check-book"); // ข้ามขั้นตอนไปสู่หน้าการตรวจสอบรหัสหนังสือ
                    }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl text-lg transition active:scale-95"
                  >
                    📚 คืนเล่มถัดไป
                  </button>

                  {/* ปุ่มคำสั่งสำหรับการยุติการทำรายการและกลับสู่หน้าจอเริ่มต้น */}
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

        <div className="relative z-10 text-center py-3 text-white text-xs bg-blue-950 border-t border-blue-800">
            หากพบปัญหา กรุณาติดต่อบรรณารักษ์ที่เคาน์เตอร์
          </div>
      </div>
    </div>
  );
}