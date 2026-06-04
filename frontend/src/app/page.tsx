"use client";
import { useState, useEffect, useRef, JSX } from "react";

const API = "http://localhost:8080/api";
//const API = "http://10.183.255.90:8080/api";

type UserType = "student" | "external";
type Step = "select-user" | "identify" | "check-book" | "drop" | "success";

type Borrower = { id: number; code: string; name: string; type: string };
type Book = { id: number; isbn: string; title: string; author: string };
type BorrowRecord = { id: number; book: Book; due_date: string };

const SPINE_COLORS = ["#2f6bff", "#5b8bff", "#1f54e6", "#f59133", "#f7b73c", "#ef6a52", "#4f9d6b", "#e0982a", "#a9c4ff"];
const SPINE_HEIGHTS = [96, 112, 82, 120, 90, 106, 100, 86, 114, 94];

function buildShelves() {
  const bands = [
    { x0: 40, x1: 430 },
    { x0: 770, x1: 1160 },
  ];
  const rows = [300, 430];
  const els: JSX.Element[] = [];

  bands.forEach((b, bi) => {
    els.push(
      <rect key={`back-${bi}`} x={b.x0} y={170} width={b.x1 - b.x0} height={274} rx={8} fill="#e7dcc6" opacity={0.6} />
    );
    rows.forEach((boardY, ri) => {
      els.push(
        <rect key={`board-${bi}-${ri}`} x={b.x0} y={boardY} width={b.x1 - b.x0} height={13} rx={4} fill="#caa06f" />
      );
      let cx = b.x0 + 12;
      let i = ri * 3 + bi;
      while (cx < b.x1 - 26) {
        const w = 22;
        const h = Math.round(SPINE_HEIGHTS[i % SPINE_HEIGHTS.length] * 0.86);
        const color = SPINE_COLORS[i % SPINE_COLORS.length];
        els.push(
          <g key={`spine-${bi}-${ri}-${cx}`}>
            <rect x={cx} y={boardY - h} width={w} height={h} rx={3} fill={color} opacity={0.9} />
            <rect x={cx} y={boardY - h} width={w} height={5} rx={2} fill="#fff" opacity={0.22} />
          </g>
        );
        cx += w + 7;
        i++;
      }
    });
  });
  return els;
}

// SVG ศรีวิชัย - ห้องสมุด (เวอร์ชันใหม่)
const SrivijayaPattern = () => (
  <svg
    className="fixed inset-0 w-full h-full pointer-events-none"
    viewBox="0 0 1200 800"
    preserveAspectRatio="xMidYMid slice"
  >
    <style>{`
      @media (prefers-reduced-motion: no-preference){
        .sv-fa{animation:sv-float 7s ease-in-out infinite}
        .sv-fb{animation:sv-float 9s ease-in-out infinite;animation-delay:-2s}
        .sv-fc{animation:sv-float 8s ease-in-out infinite;animation-delay:-4s}
        .sv-sway{animation:sv-sway 6s ease-in-out infinite;transform-box:fill-box;transform-origin:top center}
        .sv-swayb{animation:sv-sway 7.4s ease-in-out infinite;transform-box:fill-box;transform-origin:top center;animation-delay:-1.6s}
        .sv-bob{animation:sv-bob 6s ease-in-out infinite;transform-box:fill-box;transform-origin:bottom center}
        .sv-bobb{animation:sv-bob 6.8s ease-in-out infinite;transform-box:fill-box;transform-origin:bottom center;animation-delay:-1.4s}
        .sv-tw{animation:sv-tw 4s ease-in-out infinite}
      }
      @keyframes sv-float {
        0% { transform: translateY(0px) }
        50% { transform: translateY(-13px) }
        100% { transform: translateY(0px) }
      }
      @keyframes sv-sway {
        0% { transform: rotate(-2deg) }
        50% { transform: rotate(2deg) }
        100% { transform: rotate(-2deg) }
      }
      @keyframes sv-bob {
        0% { transform: translateY(0px) }
        50% { transform: translateY(-4px) }
        100% { transform: translateY(0px) }
      }
      @keyframes sv-tw {
        0% { opacity: .2 }
        50% { opacity: .9 }
        100% { opacity: .2 }
      }
    `}</style>

    <defs>
      <linearGradient id="sv-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f6f1e6" />
        <stop offset="1" stopColor="#e7eefb" />
      </linearGradient>
      <radialGradient id="sv-glow" cx="50%" cy="34%" r="62%">
        <stop offset="0" stopColor="#fff3d2" stopOpacity="0.9" />
        <stop offset="0.55" stopColor="#fdeecb" stopOpacity="0.32" />
        <stop offset="1" stopColor="#fdeecb" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="sv-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ecdcc0" />
        <stop offset="1" stopColor="#ddc7a4" />
      </linearGradient>
      <linearGradient id="sv-machine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3471ff" />
        <stop offset="1" stopColor="#1f54e6" />
      </linearGradient>
      <linearGradient id="sv-lamp" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1a2b57" />
        <stop offset="1" stopColor="#2b3f73" />
      </linearGradient>
    </defs>

    {/* wall */}
    <rect width="1200" height="800" fill="url(#sv-wall)" />
    <rect width="1200" height="800" fill="url(#sv-glow)" />
    <circle cx="600" cy="300" r="250" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.4" />

    {/* back bookshelves */}
    <g>{buildShelves()}</g>

    {/* floor */}
    <rect x="0" y="600" width="1200" height="200" fill="url(#sv-floor)" />
    <rect x="0" y="600" width="1200" height="9" fill="#cfb68f" />
    <g opacity="0.22" stroke="#c4a87e" strokeWidth="2">
      <line x1="120" y1="610" x2="30" y2="800" />
      <line x1="430" y1="610" x2="380" y2="800" />
      <line x1="770" y1="610" x2="820" y2="800" />
      <line x1="1080" y1="610" x2="1170" y2="800" />
    </g>

   {/* hanging lamps (ตำแหน่ง X เท่าเดิม แต่เพิ่มความยาว Y เลื่อนลงมาอีกนิด) */}
    <g className="sv-sway">
      {/* โคมไฟดวงซ้าย: เลื่อนลงมาที่ y=230 (เดิม 190) */}
      <line x1="160" y1="0" x2="160" y2="230" stroke="#1a2b57" strokeWidth="4" />
      <path d="M160 230 q-32 0 -36 42 h72 q-4 -42 -36 -42Z" fill="url(#sv-lamp)" />
      <ellipse cx="160" cy="274" rx="28" ry="8" fill="#ffd873" />
      <circle cx="160" cy="280" r="20" fill="#ffe9a8" opacity="0.5" />
    </g>
    <g className="sv-swayb">
      {/* โคมไฟดวงขวา: เลื่อนลงมาที่ y=210 (เดิม 170) ให้ระดับต่างกับด้านซ้ายนิดนึงเพื่อความสวยงาม */}
      <line x1="1040" y1="0" x2="1040" y2="210" stroke="#1a2b57" strokeWidth="4" />
      <path d="M1040 210 q-32 0 -36 42 h72 q-4 -42 -36 -42Z" fill="url(#sv-lamp)" />
      <ellipse cx="1040" cy="254" rx="28" ry="8" fill="#ffd873" />
      <circle cx="1040" cy="260" r="20" fill="#ffe9a8" opacity="0.5" />
    </g>

   {/* floating data nodes / particles (ขยับลงมาไม่ให้โดน Header บัง) */}
    <g className="sv-fa">
      <g transform="translate(180, 320) rotate(-15)">
        {/* 1. Data Diamond (ย้ายลงมาจาก 220 เป็น 320) */}
        <path d="M 0 -20 L 20 0 L 0 20 L -20 0 Z" fill="#38bdf8" opacity="0.8" />
        <path d="M 0 -10 L 10 0 L 0 10 L -10 0 Z" fill="#ffffff" opacity="0.6" />
      </g>
    </g>
    
    <g className="sv-fb" style={{ animationDelay: "-1s" }}>
      <g transform="translate(1100, 280) rotate(14)">
        <circle cx="0" cy="0" r="18" fill="none" stroke="#a78bfa" strokeWidth="6" opacity="0.8" />
        <circle cx="0" cy="0" r="8" fill="#c4b5fd" opacity="0.9" />
      </g>
    </g>
    
    <g className="sv-fc" style={{ animationDelay: "-2s" }}>
      <g transform="translate(450, 180) rotate(-6)">
        <path d="M 0 -15 L 13 -7.5 L 13 7.5 L 0 15 L -13 7.5 L -13 -7.5 Z" fill="#34d399" opacity="0.8" />
        <circle cx="0" cy="0" r="4" fill="#ffffff" />
      </g>
    </g>

    <g className="sv-fa" style={{ animationDelay: "-3s" }}>
      <g transform="translate(750, 190) rotate(20)">
        <path d="M 0 -18 L 16 10 L -16 10 Z" fill="#fbbf24" opacity="0.8" />
        <path d="M 0 -6 L 6 5 L -6 5 Z" fill="#ffffff" opacity="0.7" />
      </g>
    </g>

    <g className="sv-fb" style={{ animationDelay: "-4s" }}>
      <g transform="translate(360, 420) rotate(45)">
        <path d="M -5 -15 L 5 -15 L 5 -5 L 15 -5 L 15 5 L 5 5 L 5 15 L -5 15 L -5 5 L -15 5 L -15 -5 L -5 -5 Z" fill="#f472b6" opacity="0.8" />
        <rect x="-2" y="-2" width="4" height="4" fill="#ffffff" />
      </g>
    </g>

    <g className="sv-fc" style={{ animationDelay: "-5s" }}>
      <g transform="translate(820, 450) rotate(-15)">
        <rect x="-14" y="-14" width="28" height="28" rx="4" fill="#60a5fa" opacity="0.8" />
        <rect x="-6" y="-6" width="12" height="12" rx="2" fill="#ffffff" opacity="0.6" />
      </g>
    </g>
    
    {/* จุดแสงกระพริบ (Twinkling Nodes) - ขยับไฟซ้ายบนลงมาให้พ้นขอบ */}
    <circle className="sv-tw" cx="380" cy="280" r="5" fill="#ffd873" />
    <circle className="sv-tw" cx="800" cy="240" r="5" fill="#ffd873" style={{ animationDelay: "-1.5s" }} />
    <circle className="sv-tw" cx="300" cy="500" r="4" fill="#ffffff" opacity="0.7" />
    <circle className="sv-tw" cx="900" cy="500" r="5" fill="#ffffff" opacity="0.7" style={{ animationDelay: "-2s" }} />
    <circle className="sv-tw" cx="160" cy="350" r="4" fill="#38bdf8" opacity="0.6" style={{ animationDelay: "-3s" }} />
    <circle className="sv-tw" cx="1120" cy="420" r="6" fill="#a78bfa" opacity="0.5" style={{ animationDelay: "-0.5s" }} />

  {/* ===== LEFT READER (เดินอุ้มหนังสือ - เวอร์ชัน Minimalist) ===== */}
    <g transform="translate(230, 480) scale(1.15)">
      <g className="sv-bob">
        {/* ขาซ้าย */}
        <path d="M -5 15 L -25 90" stroke="#110F15" strokeWidth="15" strokeLinecap="round" />
        <path d="M -33 90 L -17 90 L -5 102 L -36 102 Z" fill="#110F15" strokeLinejoin="round" />

        {/* ขาขวา */}
        <path d="M 5 15 L 20 90" stroke="#110F15" strokeWidth="15" strokeLinecap="round" />
        <path d="M 12 90 L 28 90 L 40 102 L 8 102 Z" fill="#110F15" strokeLinejoin="round" />

        {/* แขนซ้าย */}
        <path d="M -5 -70 L 0 -35 L 25 -30" fill="none" stroke="#6A4DFF" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="25" cy="-30" r="8.5" fill="#ECA4A6" />

        {/* ลำตัว */}
        <path d="M -20 -80 L 18 -80 L 12 20 L -15 20 Z" fill="#7C60FE" strokeLinejoin="round" />

        {/* คอและหัว */}
        <rect x="-2" y="-95" width="16" height="20" fill="#ECA4A6" />
        <circle cx="8" cy="-115" r="26" fill="#ECA4A6" />
        
        {/* ทรงผม */}
        <path d="
          M -18 -115 
          C -20 -150 34 -150 34 -115 
          C 34 -105 25 -105 20 -110 
          L 15 -110 
          L 10 -95 
          L -12 -95 
          C -18 -95 -18 -105 -18 -115 
          Z" fill="#110F15" />

        {/* กองหนังสือ */}
        <g transform="translate(15, -70) rotate(15)">
          <rect x="0" y="24" width="35" height="12" rx="2" fill="#3B82F6" />
          <rect x="-3" y="12" width="36" height="10" rx="2" fill="#F59E0B" />
          <rect x="-1" y="0" width="33" height="10" rx="2" fill="#E2E8F0" />
          <rect x="5" y="4" width="20" height="2" rx="1" fill="#CBD5E1" />
        </g>

        {/* แขนขวา */}
        <path d="M 10 -70 L 15 -30 L 40 -40" fill="none" stroke="#8B73FF" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="40" cy="-40" r="8.5" fill="#ECA4A6" />
      </g>
    </g>

  {/* ===== RIGHT READER (หันหลัง เอื้อมมือซ้ายหยิบหนังสือ - เวอร์ชัน Minimalist) ===== */}
    <g transform="translate(950, 465) scale(1.15)">
      <g className="sv-bobb">
        {/* ขาซ้าย */}
        <path d="M -15 20 L -25 100 L -5 100 L 0 20 Z" fill="#110F15" />
        <rect x="-22" y="100" width="14" height="15" fill="#ECA4A6" />
        <path d="M -25 115 L -5 115 L -5 100 L -25 100 Z" fill="#110F15" />

        {/* ขาขวา */}
        <path d="M 15 20 L 5 100 L 25 100 L 30 20 Z" fill="#110F15" />
        <rect x="8" y="100" width="14" height="15" fill="#ECA4A6" />
        <path d="M 5 115 L 25 115 L 25 100 L 5 100 Z" fill="#110F15" />

        {/* ลำตัว */}
        <path d="M -35 -80 L 35 -80 C 40 -20 30 20 20 30 L -20 30 C -30 20 -40 -20 -35 -80 Z" fill="#10B981" />
        <path d="M 0 -80 L 0 25" stroke="#047857" strokeWidth="2" opacity="0.4" />

        {/* แขนขวา */}
        <path d="M 30 -70 L 45 -20 L 35 30" fill="none" stroke="#10B981" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="35" cy="30" r="9" fill="#ECA4A6" />

        {/* แขนซ้าย (วาดก่อนผม ให้อยู่ใต้ผม) */}
        <path d="M -30 -70 L -60 -110 L -80 -155" fill="none" stroke="#34D399" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />

        {/* คอและหัว */}
        <rect x="-10" y="-100" width="20" height="25" fill="#ECA4A6" />
        <circle cx="0" cy="-120" r="28" fill="#ECA4A6" />

        {/* ทรงผม */}
        <path d="M -32 -120 C -40 -165 40 -165 32 -120 L 38 -30 C 20 -15 -20 -15 -38 -30 Z" fill="#110F15" />
        
        {/* หนังสือบนชั้น */}
        <g transform="translate(-100, -180) rotate(-15)">
          <rect x="0" y="0" width="18" height="35" rx="3" fill="#F59E0B" />
          <rect x="3" y="0" width="15" height="35" rx="2" fill="#D97706" />
        </g>

        {/* มือซ้าย */}
        <circle cx="-80" cy="-155" r="9" fill="#ECA4A6" />
      </g>
    </g>

    {/* foreground plants */}
    <g transform="translate(64,560)">
      <g className="sv-fc">
        <rect x="-32" y="74" width="64" height="66" rx="12" fill="#c97a45" />
        <rect x="-32" y="74" width="64" height="16" rx="8" fill="#b3673a" />
        <path d="M0 74 C-10 28 -42 16 -48 -18 C-16 -6 4 22 6 56Z" fill="#4f9d6b" />
        <path d="M0 74 C8 24 42 12 50 -24 C16 -8 -2 24 -4 58Z" fill="#5fb27c" />
        <path d="M0 78 C0 34 0 6 0 -32 C16 0 14 42 8 76Z" fill="#3f8a59" />
      </g>
    </g>
    <g transform="translate(1140,560)">
      <g className="sv-fb">
        <rect x="-32" y="74" width="64" height="66" rx="12" fill="#c97a45" />
        <rect x="-32" y="74" width="64" height="16" rx="8" fill="#b3673a" />
        <path d="M0 74 C-10 28 -42 16 -48 -18 C-16 -6 4 22 6 56Z" fill="#5fb27c" />
        <path d="M0 74 C8 24 42 12 50 -24 C16 -8 -2 24 -4 58Z" fill="#4f9d6b" />
        <path d="M0 78 C0 34 0 6 0 -32 C16 0 14 42 8 76Z" fill="#3f8a59" />
      </g>
    </g>
  </svg>
);


export default function TabletPage() {
  const [step, setStep] = useState<Step>("select-user");
  const [userType, setUserType] = useState<UserType>("student");
  const [inputCode, setInputCode] = useState("");
  const [inputISBN, setInputISBN] = useState("");
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [activeBorrows, setActiveBorrows] = useState<BorrowRecord[]>([]);
  const [capacity, setCapacity] = useState(0);
  const [isFull, setIsFull] = useState(false);
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

  // ดึงสถานะตู้จากเซิร์ฟเวอร์
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API}/status`);
        const data = await res.json();
        setCapacity(data.capacity);
        setIsFull(data.is_full);
        // อัพเดตสถานะมอเตอร์จากเซิร์ฟเวอร์
        setMotorOpen(data.motor_status === "open" || data.motor_status === "dump");
      } catch { }
    };
    fetch_();
    const t = setInterval(fetch_, 3000);
    return () => clearInterval(t);
  }, []);

  // รับสัญญาณจาก Simulator ผ่าน WebSocket
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8080/ws/tablet");
    //const ws = new WebSocket("ws://10.183.255.90:8080/ws/tablet");

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
      fetch(`${API}/dashboard/motor/open`, { method: "POST" }).catch(() => { });
      setMotorOpen(true);
    } else if (step !== "check-book") {
      motorOpenedRef.current = false;
    }
  }, [step]);

  // ปิดตู้เมื่อกลับหน้าแรก (ถ้าเปิดอยู่)
  useEffect(() => {
    if (step === "select-user" && motorOpen) {
      fetch(`${API}/dashboard/motor/close`, { method: "POST" }).catch(() => { });
      setMotorOpen(false);
    }
  }, [step, motorOpen]);

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
      fetch(`${API}/dashboard/motor/close`, { method: "POST" }).catch(() => { });
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



  // แสดงหน้าตู้เต็มถ้าความจุเต็ม
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

          {/* หน้าแจ้งเตือนตู้เต็ม */}
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

              {/* คำแนะนำ */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
                <p className="text-blue-700 font-semibold text-sm mb-2">📋 กรุณาดำเนินการดังนี้</p>
                <ul className="text-blue-600 text-sm space-y-1">
                  <li>• ติดต่อบรรณารักษ์ที่เคาน์เตอร์</li>
                  <li>• คืนหนังสือที่เคาน์เตอร์บริการโดยตรง</li>
                  <li>• รอจนกว่าเจ้าหน้าที่จะเคลียร์ตู้</li>
                </ul>
              </div>

              {/* แจ้งว่าอัปเดตอัตโนมัติ */}
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

                {/* หนังสือที่ยังไม่คืน */}
                {activeBorrows.length > 0 && (
                  <div className="bg-yellow-50 rounded-xl p-4 mb-4 border border-yellow-200 text-left">
                    <p className="text-yellow-700 text-xs font-semibold mb-2">📚 หนังสือที่ยังไม่คืน ({activeBorrows.length} เล่ม)</p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {activeBorrows.map((r) => (
                        <div key={r.id} className="text-sm text-gray-700 pb-2 border-b border-yellow-100 last:border-0">
                          <p className="font-medium">{r.book?.title}</p>
                          <p className="text-gray-500 text-xs">กำหนดคืน: {new Date(r.due_date).toLocaleDateString("th-TH")}</p>
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

        <div className="relative z-10 text-center py-3 text-white text-xs bg-blue-950 border-t border-blue-800">
            หากพบปัญหา กรุณาติดต่อบรรณารักษ์ที่เคาน์เตอร์
          </div>
      </div>
    </div>
  );
}