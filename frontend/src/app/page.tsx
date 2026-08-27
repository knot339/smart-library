"use client";
import { useState, useEffect, useRef } from "react";

import AnimatedBackground from "../components/AnimatedBackground";
import { Step, Borrower, Book, BorrowRecord } from "../types";
import { API_BASE_URL as API, WS_BASE_URL } from "../lib/config";

export default function TabletPage() {
  const [step, setStep] = useState<Step>("select-user");
  const [inputCode, setInputCode] = useState("");
  const [inputBarcode, setInputBarcode] = useState("");
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [booksToReturn, setBooksToReturn] = useState<Book[]>([]);
  const [activeBorrows, setActiveBorrows] = useState<any[]>([]);
  const [isFull, setIsFull] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [time, setTime] = useState("");
  const [motorOpen, setMotorOpen] = useState(false);
  const [motorLoading, setMotorLoading] = useState(false);
  const [returnTime, setReturnTime] = useState<Date | null>(null);
  const booksEndRef = useRef<HTMLDivElement>(null);

  const runMotor = async (command: "open" | "dump" | "close", waitMs: number) => {
    setMotorLoading(true);
    try {
      await fetch(`${API}/dashboard/motor/${command}`, { method: "POST" });
      await new Promise(res => setTimeout(res, waitMs));
      if (command === "open") setMotorOpen(true);
      if (command === "close") setMotorOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setMotorLoading(false);
    }
  };

  // เลื่อนหน้าจอลงอัตโนมัติเมื่อมีการสแกนหนังสือเพิ่ม
  useEffect(() => {
    if (step === "check-book" && booksToReturn.length > 0) {
      booksEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [booksToReturn, step]);


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

  // รับข้อมูลจากการสแกน Barcode/Keyboard แบบ Global (ไม่ต้องคลิกที่ช่อง input ก่อน)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // ถ้าโฟกัสอยู่ที่ input อยู่แล้ว ให้ทำงานตามปกติ
      if (document.activeElement?.tagName === "INPUT") return;
      // ข้ามปุ่มควบคุมต่างๆ
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      
      if (step === "identify") {
        const el = document.getElementById("input-identify");
        if (el) {
          el.focus();
          if (e.key.length === 1) {
            setInputCode(prev => prev + e.key);
            e.preventDefault();
          }
        }
      } else if (step === "check-book") {
        const el = document.getElementById("input-check-book");
        if (el) {
          el.focus();
          if (e.key.length === 1) {
            setInputBarcode(prev => prev + e.key);
            e.preventDefault();
          }
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [step]);


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
              await runMotor("open", 10000);
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

      await runMotor("open", 10000);
      setStep("check-book");
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
    setLoading(false);
  };

  // ขั้นตอนที่ 2: ตรวจสอบข้อมูลรายละเอียดของหนังสือโดยใช้รหัส Barcode
  const handleCheckBook = async () => {
    if (!inputBarcode.trim()) {
      setBooksToReturn([]);
      return;
    }

    const barcodes = inputBarcode.split(/[\s,]+/).filter(b => b.trim() !== "");
    if (barcodes.length === 0) {
      setBooksToReturn([]);
      return;
    }

    setLoading(true);
    setErrorMsg("");

    let newBooks: Book[] = [];
    let errors: string[] = [];

    for (const barcode of barcodes) {
      try {
        const res = await fetch(`${API}/book/barcode/${barcode.trim()}`);
        const data = await res.json();
        if (!res.ok) {
          errors.push(`${barcode}: ${data.error || "ไม่พบหนังสือ"}`);
          continue;
        }

        if (newBooks.some(b => b.id === data.id)) {
          continue;
        }

        newBooks.push(data);
      } catch {
        errors.push(`${barcode}: เกิดข้อผิดพลาด`);
      }
    }

    setBooksToReturn(newBooks);

    if (errors.length > 0) {
      setErrorMsg(errors.join(" | "));
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

      // สั่งการให้ระบบฮาร์ดแวร์ดำเนินการเทหนังสือ (Dump) ลงในตู้จัดเก็บ และรอ 10 วินาที
      await runMotor("dump", 10000);

      // หน่วงเวลา 5 วินาที เพื่อให้แน่ใจว่าหนังสือตกลงในตู้จัดเก็บอย่างสมบูรณ์
      setMotorLoading(true);
      await new Promise(resolve => setTimeout(resolve, 5000));
      setMotorLoading(false);

      // สั่งการปิดตู้รับคืน (ยืดแกนชักจนสุด) และรอ 20 วินาที
      await runMotor("close", 20000);
      setReturnTime(new Date());
      setStep("success");
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
    setLoading(false);
  };

  const handleReset = async () => {
    // ดำเนินการปิดตู้รับคืนหากยังเปิดอยู่ พร้อมทั้งรีเซ็ตข้อมูลการทำรายการทั้งหมด
    if (motorOpen) {
      await runMotor("close", 10000);
    }
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
      await runMotor("open", 10000);
      setStep("check-book");
    } catch { setErrorMsg("เกิดข้อผิดพลาด"); }
    setLoading(false);
  };

  const handleCheckBookWithBarcode = async (barcode: string) => {
    if (!barcode.trim()) {
      setBooksToReturn([]);
      return;
    }

    const barcodes = barcode.split(/[\s,]+/).filter(b => b.trim() !== "");
    if (barcodes.length === 0) {
      setBooksToReturn([]);
      return;
    }

    setLoading(true);
    setErrorMsg("");

    let newBooks: Book[] = [];
    let errors: string[] = [];

    for (const b of barcodes) {
      try {
        const res = await fetch(`${API}/book/barcode/${b.trim()}`);
        const data = await res.json();
        if (!res.ok) {
          errors.push(`${b}: ${data.error || "ไม่พบหนังสือ"}`);
          continue;
        }

        if (newBooks.some(x => x.id === data.id)) {
          continue;
        }
        newBooks.push(data);
      } catch {
        errors.push(`${b}: เกิดข้อผิดพลาด`);
      }
    }

    setBooksToReturn(newBooks);

    if (errors.length > 0) {
      setErrorMsg(errors.join(" | "));
    }

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
      <div className="min-h-screen bg-gradient-to-b from-blue-950 to-blue-900 flex flex-col select-none relative">
        <AnimatedBackground />
        <div className="relative z-10 flex flex-col flex-1">

          {/* Header */}
          <div className="bg-blue-950 px-10 py-6 flex justify-between items-center border-b border-blue-800 shadow-lg">
            <div className="flex items-center gap-5">
              <div className="bg-white rounded-full w-16 h-16 flex items-center justify-center p-2">
                <img src="/images/LOGO-RUTS-07-2-copy.png" alt="RUTS Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <p className="text-blue-300 text-base tracking-widest uppercase mb-1">Book Return Station</p>
                <h1 className="text-white text-2xl font-bold">ระบบรับคืนหนังสืออัตโนมัติ</h1>
              </div>
            </div>
            <div className="text-right">
              <p className="text-blue-400 text-base mb-1">เวลาปัจจุบัน</p>
              <p className="text-white text-4xl font-mono font-bold">{time}</p>
              <div className="flex items-center gap-2 mt-2 justify-end">
                <div className={`w-3 h-3 rounded-full bg-red-400`} />
                <p className={`text-base text-red-300`}>
                  ตู้เต็ม
                </p>
              </div>
            </div>
          </div>

          {/* ส่วนแสดงหน้าจอแจ้งเตือนเมื่อตู้รับคืนหนังสือเต็ม */}
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 text-center flex flex-col justify-center min-h-[400px]">

              {/* ไอคอนแจ้งเตือน */}
              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-5xl">🚫</span>
              </div>

              <h2 className="text-3xl font-bold text-red-600 mb-3">
                ขออภัย — ตู้เต็มแล้ว
              </h2>

              <p className="text-gray-600 mb-2 text-xl font-semibold">
                ขณะนี้ตู้รับคืนหนังสือเต็มแล้ว
              </p>
              <p className="text-gray-500 text-lg mb-5">
                ไม่สามารถรับคืนหนังสือได้ในขณะนี้
              </p>

              {/* ส่วนแสดงคำแนะนำการดำเนินการสำหรับผู้ใช้งาน */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5 text-left">
                <p className="text-blue-700 font-bold text-lg mb-2">📋 กรุณาดำเนินการดังนี้</p>
                <ul className="text-blue-600 text-base space-y-2 pl-2">
                  <li>• ติดต่อบรรณารักษ์ที่เคาน์เตอร์</li>
                  <li>• คืนหนังสือที่เคาน์เตอร์บริการโดยตรง</li>
                  <li>• รอจนกว่าเจ้าหน้าที่จะเคลียร์ตู้</li>
                </ul>
              </div>

              {/* ข้อความแจ้งเตือนเกี่ยวกับการอัปเดตสถานะอัตโนมัติของระบบ */}
              <p className="text-gray-400 text-sm">
                🔄 ระบบจะอัปเดตสถานะอัตโนมัติทุก 3 วินาที
                <br />หน้านี้จะกลับสู่ปกติเมื่อตู้มีพื้นที่ว่าง
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="relative z-10 text-center py-6 text-white text-xl bg-blue-950 border-t border-blue-800">
            หากพบปัญหา กรุณาติดต่อบรรณารักษ์ที่เคาน์เตอร์
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-gradient-to-b from-blue-950 to-blue-900 flex flex-col select-none relative overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 flex flex-col h-full overflow-hidden">

        {/* Header */}
        <div className="bg-blue-950 px-8 py-4 flex justify-between items-center border-b border-blue-800 shadow-lg shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-white rounded-full w-14 h-14 flex items-center justify-center p-2">
              <img src="/images/LOGO-RUTS-07-2-copy.png" alt="RUTS Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-blue-300 text-sm tracking-widest uppercase mb-0.5">Book Return Station</p>
              <h1 className="text-white text-xl font-bold">ระบบรับคืนหนังสืออัตโนมัติ</h1>
            </div>
          </div>
          <div className="text-right">
            <p className="text-blue-400 text-base mb-1">เวลาปัจจุบัน</p>
            <p className="text-white text-4xl font-mono font-bold">{time}</p>
            <div className="flex items-center gap-2 mt-2 justify-end">
              <div className={`w-3 h-3 rounded-full ${motorOpen ? "bg-yellow-400 animate-pulse" : isFull ? "bg-red-400" : "bg-green-400"}`} />
              <p className={`text-base ${motorOpen ? "text-yellow-300" : isFull ? "text-red-300" : "text-green-300"}`}>
                {motorOpen ? "ตู้เปิดอยู่" : isFull ? "ตู้เต็ม" : "ตู้ว่าง"}
              </p>
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex justify-center items-center gap-0 py-4 bg-blue-950 border-b border-blue-800 flex-wrap shrink-0">
          {steps.map((s, i) => {
            const isDone = i < currentStepIndex;
            const isActive = i === currentStepIndex;
            return (
              <div key={s.key} className="flex items-center">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-lg font-semibold transition-all
                ${isActive ? "bg-white text-blue-900 shadow-xl scale-105" : isDone ? "bg-blue-500 text-white" : "bg-blue-800 text-blue-500"}`}>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-base font-bold
                  ${isActive ? "bg-blue-900 text-white" : isDone ? "bg-white text-blue-600" : "bg-blue-700 text-blue-400"}`}>
                    {isDone ? "✓" : i + 1}
                  </span>
                  {s.label}
                </div>
                {i < steps.length - 1 && <div className={`w-8 h-1 ${i < currentStepIndex ? "bg-blue-500" : "bg-blue-800"}`} />}
              </div>
            );
          })}
        </div>

        {/* Main Card Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 min-h-0 flex justify-center items-stretch w-full">
          
          <div className="flex w-full max-w-[1400px] items-stretch">
            {/* Spacer ซ้าย (เพื่อให้กล่องกลางอยู่ตรงกลางเสมอ) */}
            <div className="flex-1 hidden lg:block" />

            {/* กล่องตรงกลาง (Center Card) */}
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 flex flex-col relative min-h-[450px] h-full shrink-0 overflow-hidden z-10 mx-auto">
            
            {/* Motor Loading Overlay for the Card */}
            {motorLoading && (
              <div className="absolute inset-0 z-50 bg-white/90 flex flex-col items-center justify-center backdrop-blur-sm">
                <div className="w-20 h-20 border-8 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6 shadow-lg"></div>
                <h2 className="text-2xl font-bold text-blue-900 mb-2">กรุณารอสักครู่...</h2>
                <p className="text-blue-600 text-lg animate-pulse font-medium text-center px-4">ระบบกำลังควบคุมมอเตอร์แกนชัก</p>
              </div>
            )}

            {/* ขั้นตอนที่ 1: หน้าจอเริ่มต้นระบบการรับคืนหนังสือ */}
            {step === "select-user" && (
              <div className="text-center flex-1 flex flex-col justify-center">
                <div className="text-6xl mb-6 soft-bounce">📚</div>
                <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-900 mb-3">ยินดีต้อนรับ</h2>
                <p className="text-gray-600 mb-2 text-xl font-semibold">ระบบรับคืนหนังสืออัตโนมัติ</p>
                <p className="text-gray-400 mb-8 text-base">Smart Library Return Station</p>
                <button onClick={() => { setStep("identify"); setInputCode(""); setErrorMsg(""); }}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 active:scale-95 text-white font-bold py-5 rounded-2xl text-2xl transition-all shadow-xl transform hover:shadow-2xl">
                  เริ่มต้น
                </button>
                <p className="text-gray-400 text-sm mt-6">กรุณากดปุ่มเพื่อเริ่มกระบวนการคืนหนังสือ</p>
              </div>
            )}

            {/* ขั้นตอนที่ 2: หน้าจอสำหรับการกรอกข้อมูลเพื่อระบุตัวตนผู้ใช้งาน */}
            {step === "identify" && (
              <div className="text-center flex-1 flex flex-col justify-center">
                <div className="text-7xl mb-6">🪪</div>
                <h2 className="text-4xl font-bold text-blue-900 mb-3">ระบุตัวตน</h2>
                <p className="text-gray-400 text-xl mb-8">กรุณากรอกรหัส บัตรนักศึกษา หรือเบอร์โทร</p>
                <input
                  id="input-identify"
                  type="text"
                  placeholder="รหัศนักศึกษา หรือ เบอร์โทร"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleIdentify()}
                  className="w-full border-2 border-blue-200 rounded-2xl px-6 py-6 text-3xl text-center tracking-widest mb-4 focus:outline-none focus:border-blue-500 text-gray-800"
                />
                {errorMsg && <p className="text-red-500 text-lg mb-4">{errorMsg}</p>}
                <button onClick={handleIdentify} disabled={loading}
                  className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white font-bold py-6 rounded-2xl text-2xl transition mt-4">
                  {loading ? "⏳ กำลังตรวจสอบ..." : "ยืนยัน →"}
                </button>
                <button onClick={handleReset} className="w-full mt-5 text-gray-400 hover:text-gray-600 text-lg py-3">← ย้อนกลับ</button>
              </div>
            )}

            {/* ขั้นตอนที่ 3: หน้าจอสำหรับการสแกนและตรวจสอบข้อมูลหนังสือ */}
            {step === "check-book" && (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="text-center flex-none">
                  <div className="text-6xl mb-2">📖</div>
                  <h2 className="text-3xl font-bold text-blue-900 mb-1">ตรวจสอบหนังสือ</h2>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar px-2 my-2 space-y-4">
                  {/* ส่วนแสดงรายละเอียดข้อมูลของผู้ใช้งานที่กำลังทำรายการ */}
                  <div className="bg-blue-50/80 rounded-2xl p-4 border border-blue-100 flex items-center justify-between gap-3 mb-4">
                    <div className="text-left">
                      <p className="text-blue-400 text-xs mb-1 font-semibold uppercase tracking-wider">ผู้คืนหนังสือ</p>
                      <p className="text-blue-900 text-2xl font-bold leading-none">{borrower?.name}</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <p className="text-blue-700 font-semibold bg-blue-200/50 px-3 py-1 rounded-lg text-lg mb-1">{borrower?.code}</p>
                      {borrower?.phone && (
                        <p className="text-blue-500 text-sm">📱 {borrower.phone}</p>
                      )}
                    </div>
                  </div>
                  <div ref={booksEndRef} />
                </div>

                <div className="text-center flex-none mt-auto">
                  <p className="text-gray-500 text-base mb-2">กรอก Barcode ของหนังสือที่ต้องการคืน</p>
                  <input
                    id="input-check-book"
                    type="text"
                    placeholder="Barcode หรือ รหัสหนังสือ"
                    value={inputBarcode}
                    onChange={(e) => setInputBarcode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCheckBook()}
                    className="w-full border-2 border-blue-200 rounded-2xl px-6 py-4 text-xl text-center tracking-widest mb-3 focus:outline-none focus:border-blue-500 text-gray-800"
                  />
                  {errorMsg && <p className="text-red-500 text-base mb-3">{errorMsg}</p>}
                  <div className="flex gap-3">
                    <button onClick={() => setStep("drop")} disabled={booksToReturn.length === 0}
                      className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl text-xl transition">
                      ดำเนินการคืน ({booksToReturn.length} เล่ม) →
                    </button>
                  </div>
                  <button onClick={handleReset} className="w-full mt-3 text-gray-400 hover:text-gray-600 text-base py-2">← ยกเลิกและกลับหน้าแรก</button>
                </div>
              </div>
            )}

            {/* ขั้นตอนที่ 4: หน้าจอแนะนำและยืนยันการคืนหนังสือเข้าตู้ */}
            {step === "drop" && (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="text-center flex-none">
                  <div className="text-6xl mb-2">📥</div>
                  <h2 className="text-2xl font-bold text-blue-900 mb-2">ดำเนินการคืนหนังสือเข้าตู้</h2>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar px-2 my-1 space-y-3">
                  {/* ส่วนแสดงรายละเอียดข้อมูลของหนังสือที่ได้รับการตรวจสอบแล้ว */}
                  <div className="bg-green-50 rounded-2xl p-5 border border-green-200 text-left">
                    <p className="text-green-600 text-base font-semibold mb-3">✅ เตรียมคืน ({booksToReturn.length} เล่ม)</p>
                    <div className="pr-2">
                      {booksToReturn.map(b => (
                        <div key={b.id} className="border-b border-green-100 last:border-0 py-2">
                          <p className="text-gray-800 text-xl font-bold">{b.title}</p>
                          <p className="text-gray-500 text-lg">{b.author}</p>
                          <p className="text-gray-400 text-sm mt-1">Barcode: {b.barcode}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ไม่ต้องแสดงหนังสือค้างส่งในกล่องกลางแล้ว ไปแสดงกล่องขวาแทน */}
                </div>

                <div className="text-center flex-none mt-auto">
                  <div className="bg-yellow-50 rounded-2xl p-3 mb-3 border border-yellow-200">
                    <p className="text-yellow-700 text-base font-medium">🔓 ตู้เปิดอยู่ — กรุณากดยืนยันเพื่อคืนหนังสือ</p>
                  </div>

                  {errorMsg && <p className="text-red-500 text-base mb-3">{errorMsg}</p>}
                  <button onClick={handleDropBook} disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl text-2xl transition shadow-lg active:scale-95">
                    {loading ? "⏳ กำลังบันทึก..." : "✅ ดำเนินการคืนหนังสือ"}
                  </button>
                  <button onClick={() => setStep("check-book")} className="w-full mt-3 text-gray-400 hover:text-gray-600 text-base py-2">← ยกเลิก</button>
                </div>
              </div>
            )}

            {/* ขั้นตอนที่ 5: หน้าจอแสดงผลลัพธ์การทำรายการคืนหนังสือสำเร็จ */}
            {step === "success" && (
              <div className="text-center flex flex-col justify-center h-full overflow-hidden">
                <div className="flex-none">
                  <div className="text-6xl mb-2">🎉</div>
                  <h2 className="text-3xl font-bold text-green-700 mb-1">
                    คืนหนังสือสำเร็จ!
                  </h2>
                  <p className="text-gray-500 text-lg mb-3">บันทึกลงฐานข้อมูลเรียบร้อยแล้ว</p>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar px-2 space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-left">
                    <p className="text-green-600 text-base font-semibold mb-3">✅ รายละเอียดการคืน</p>
                    <p className="text-gray-700 text-lg"><span className="text-gray-400">ผู้คืน: </span>{borrower?.name}</p>
                    <p className="text-gray-700 text-lg"><span className="text-gray-400">จำนวน: </span>{booksToReturn.length} เล่ม</p>
                    <div className="pl-5 border-l-4 border-green-200 my-3 max-h-32 overflow-y-auto custom-scrollbar pr-2">
                      {booksToReturn.map((b, i) => <p key={i} className="text-gray-700 text-lg truncate">{b.title}</p>)}
                    </div>
                    {returnTime && (
                      <p className="text-gray-700 text-lg"><span className="text-gray-400">เวลา: </span>{returnTime.toLocaleString("th-TH")}</p>
                    )}
                  </div>


                </div>

                <div className="flex flex-col gap-3 flex-none mt-4">
                  {/* ปุ่มคำสั่งสำหรับการดำเนินการคืนหนังสือเล่มถัดไป ด้วยข้อมูลผู้ใช้งานเดิม */}
                  <button
                    onClick={async () => {
                      setBooksToReturn([]);
                      setInputBarcode("");
                      setErrorMsg("");
                      await runMotor("open", 10000);
                      setStep("check-book"); // ข้ามขั้นตอนไปสู่หน้าการตรวจสอบรหัสหนังสือ
                    }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-2xl text-xl transition active:scale-95"
                  >
                    📚 คืนเล่มถัดไป
                  </button>

                  {/* ปุ่มคำสั่งสำหรับการยุติการทำรายการและกลับสู่หน้าจอเริ่มต้น */}
                  <button
                    onClick={handleReset}
                    className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-4 rounded-2xl text-xl transition active:scale-95"
                  >
                    ✅ เสร็จสิ้น
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* กล่องขวา (Right Panel) สำหรับแสดงข้อมูลเสริม */}
          <div className="flex-1 hidden lg:flex pl-6 items-stretch justify-start">
            {(step === "check-book" || step === "drop") && (
              <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-xl w-full max-w-sm p-6 flex flex-col relative h-full shrink-0 overflow-hidden border border-white/50">
                <h3 className="text-xl font-bold text-blue-900 mb-4 border-b border-gray-200 pb-2">ข้อมูลเพิ่มเติม</h3>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                  {/* แสดงหนังสือที่สแกนแล้วเฉพาะในหน้า check-book (หน้า drop จะแสดงตรงกลางอยู่แล้ว) */}
                  {step === "check-book" && booksToReturn.length > 0 && (
                    <div className="bg-green-50 rounded-2xl p-4 border border-green-200">
                      <p className="text-green-700 font-semibold text-lg mb-2">✅ สแกนแล้ว ({booksToReturn.length} เล่ม)</p>
                      <div className="space-y-2">
                        {booksToReturn.map(b => (
                          <div key={b.id} className="text-lg text-gray-800 border-b border-green-100 last:border-0 pb-1 truncate">
                            {b.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* แสดงหนังสือค้างส่ง (เสมอใน check-book และ drop) */}
                  {activeBorrows.length > 0 ? (
                    <div className="bg-yellow-50 rounded-2xl p-4 border border-yellow-200">
                      <p className="text-yellow-700 text-lg font-semibold mb-2">📋 ค้างส่ง ({activeBorrows.length} เล่ม)</p>
                      <div className="space-y-3">
                        {activeBorrows.map((r, idx) => (
                          <div key={r.NO || idx} className="text-base text-gray-700 border-b border-yellow-100 last:border-0 pb-2">
                            <p className="font-medium line-clamp-2 leading-snug">{r.TITLE}</p>
                            <p className="text-gray-500 text-xs mt-1">กำหนดคืน: {r.DUEDATE}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 text-center">
                      <p className="text-gray-400 text-base">ไม่พบรายการค้างส่ง</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          </div>
        </div>

        <div className="relative z-10 text-center py-3 text-white text-base bg-blue-950 border-t border-blue-800 shrink-0">
          หากพบปัญหา กรุณาติดต่อบรรณารักษ์ที่เคาน์เตอร์
        </div>
      </div>
    </div>
  );
}