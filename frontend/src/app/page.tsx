"use client";
import { useState, useEffect, useRef } from "react";

import AnimatedBackground from "../components/AnimatedBackground";
import { Step, Borrower, Book, BorrowRecord, PatronBorrow } from "../types";
import { API_BASE_URL as API, WS_BASE_URL } from "../lib/config";

export default function TabletPage() {
  const [step, setStep] = useState<Step>("select-user");
  const [inputCode, setInputCode] = useState("");
  const [inputBarcode, setInputBarcode] = useState("");
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [booksToReturn, setBooksToReturn] = useState<Book[]>([]);
  const [activeBorrows, setActiveBorrows] = useState<PatronBorrow[]>([]);
  const [isFull, setIsFull] = useState(false);
  const [esp32Connected, setEsp32Connected] = useState(true); // true ไว้ก่อนกันจอกระพริบตอนเพิ่งโหลดหน้า

  // รหัสตู้ที่แท็บเล็ตเครื่องนี้ผูกอยู่ — ตั้งครั้งเดียวตอนติดตั้งเครื่อง เก็บถาวรใน localStorage ของ
  // เบราว์เซอร์ (ไม่หายตอนปิด-เปิดเครื่องใหม่ หายเฉพาะตอน clear browsing data/ใช้ incognito) ไม่มีค่า
  // นี้แปลว่ายังไม่เคยตั้งค่าเลย (เครื่องใหม่/ยังไม่ติดตั้ง) ต้องโชว์หน้าจอตั้งค่าก่อนใช้งานจริง
  const CABINET_ID_STORAGE_KEY = "smart_library_cabinet_id";
  const [cabinetId, setCabinetId] = useState("");
  const [cabinetIdReady, setCabinetIdReady] = useState(false); // true หลังเช็ค localStorage ครั้งแรกแล้ว
  const [cabinetIdInput, setCabinetIdInput] = useState("");
  // เผื่อไว้ก่อน (true) กันจอกระพริบไปโชว์ "ปิดให้บริการชั่วคราว" ชั่ววูบตอนเพิ่งโหลดหน้า/ยังไม่ได้ค่าจริง
  const [cabinetActive, setCabinetActive] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setCabinetId(localStorage.getItem(CABINET_ID_STORAGE_KEY) || "");
      } catch { }
      setCabinetIdReady(true);
    })();
  }, []);

  const handleSetupCabinet = () => {
    const trimmed = cabinetIdInput.trim();
    if (!trimmed) return;
    try { localStorage.setItem(CABINET_ID_STORAGE_KEY, trimmed); } catch { }
    setCabinetId(trimmed);
  };

  // ล้างรหัสตู้ที่บันทึกไว้ แล้วกลับไปโชว์หน้าจอตั้งค่าใหม่ — เรียกได้ 2 ทาง: (1) เจ้าหน้าที่กดปุ่ม
  // "เคลียร์การตั้งค่าแท็บเล็ต" จากหน้า Dashboard ของตู้นี้ (ส่งมาผ่าน WebSocket ข้อความ
  // {"type":"reset_setup"} ไม่ต้องยืนยันซ้ำที่นี่ เพราะยืนยันจากฝั่ง Dashboard มาแล้ว) หรือ (2) แตะโลโก้
  // ที่ตัวเครื่องติดกัน 5 ครั้งเร็วๆ (ใช้ตอนเครื่องไม่ได้ต่อเน็ต/WebSocket หลุดอยู่ เลยสั่งจาก Dashboard
  // ไม่ได้) ซึ่งจะมี confirm ถามก่อนเสมอเพราะกดโดยไม่ตั้งใจได้ง่ายกว่า
  const resetCabinetSetup = () => {
    try { localStorage.removeItem(CABINET_ID_STORAGE_KEY); } catch { }
    setCabinetIdInput("");
    setCabinetId("");
  };

  // นับจำนวนครั้งที่แตะโลโก้ติดกัน (รีเซ็ตตัวนับถ้าเว้นช่วงนานเกิน 2 วิ) ครบ 5 ครั้งแล้วถาม confirm ก่อน
  // ล้างค่า — จุดลับสำหรับเจ้าหน้าที่เท่านั้น ไม่โชว์ว่ากดได้ให้เห็นชัดๆ เพราะหน้านี้เป็นจอสาธารณะ
  const logoTapCountRef = useRef(0);
  const logoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLogoTap = () => {
    logoTapCountRef.current += 1;
    if (logoTapTimerRef.current) clearTimeout(logoTapTimerRef.current);
    logoTapTimerRef.current = setTimeout(() => { logoTapCountRef.current = 0; }, 2000);
    if (logoTapCountRef.current >= 5) {
      logoTapCountRef.current = 0;
      if (logoTapTimerRef.current) clearTimeout(logoTapTimerRef.current);
      if (window.confirm("ต้องการล้างการตั้งค่ารหัสตู้ของเครื่องนี้ แล้วเปิดหน้าตั้งค่าใหม่หรือไม่?\n(สำหรับเจ้าหน้าที่เท่านั้น)")) {
        resetCabinetSetup();
      }
    }
  };

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [time, setTime] = useState("");
  const [motorOpen, setMotorOpen] = useState(false);
  const [motorLoading, setMotorLoading] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [returnTime, setReturnTime] = useState<Date | null>(null);
  const booksEndRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingRfidRef = useRef<string[]>([]);
  const initialMotorCheckedRef = useRef(false);
  const actionLockUntilRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  // กันเรียก processScannedBarcodes ซ้อนกัน (ไม่เหมือนปุ่มที่กันด้วย guardedAction อยู่แล้ว เส้นทางที่
  // ถูกยิงจาก WebSocket ตอนเครื่องอ่าน RFID/บาร์โค้ดส่งสัญญาณซ้ำไวๆ ไม่ได้ผ่าน guardedAction เลย ต้องกัน
  // ด้วย ref ที่ปรับค่าทันที ไม่พึ่ง state "loading" เพราะ setState เป็น async ทำให้เช็คไม่ทันการยิงซ้ำในช่วงสั้นๆ)
  const processingScanRef = useRef(false);
  // ค่าตั้งต้นก่อนดึงจากเซิร์ฟเวอร์สำเร็จ (เผื่อ fetch ช้า/พัง) — ค่าจริงตั้งได้จากหน้า Dashboard
  const [idleTimeoutMs, setIdleTimeoutMs] = useState(10000);
  const [dumpSettleMs, setDumpSettleMs] = useState(5000);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // กันปุ่มเปลี่ยนขั้นตอนหลักถูกกดซ้ำในพริบตา (ดับเบิ้ลแทป หรือจอสัมผัสเด้งสัญญาณซ้ำ) ซึ่งอาจทำให้
  // แทปที่สองดันไปโดนปุ่มของหน้าถัดไปที่เพิ่ง re-render ขึ้นมาแทนที่ตำแหน่งเดิมพอดี (เช่น กด
  // "ดำเนินการคืน" ที่หน้าตรวจสอบหนังสือ แล้วแทปที่สองไปโดนปุ่ม "ดำเนินการคืนหนังสือ" ของหน้า
  // หย่อนหนังสือทันที ทำให้ดูเหมือนข้ามหน้าหย่อนหนังสือไปเลย) — บล็อกการกดซ้ำในช่วงสั้นๆ หลังกดแต่ละครั้ง
  const guardedAction = (fn: () => void) => () => {
    const now = Date.now();
    if (now < actionLockUntilRef.current) return;
    actionLockUntilRef.current = now + 600;
    fn();
  };
  // ชี้ไปยังฟังก์ชันเวอร์ชันล่าสุดของแต่ละ render เสมอ (sync ไว้ด้านล่าง) — จำเป็นเพราะ WebSocket
  // onmessage ถูกสร้างครั้งเดียวตอน mount (useEffect deps = []) ถ้าเรียกฟังก์ชันจากตัวแปรตรงๆ
  // จะได้ closure ของตอน mount ตลอดไป (เช่น borrower จะเป็น null ค้างตลอดไป ทำให้บันทึกข้อมูล
  // ผู้คืนว่างเปล่าตอนมีการสแกนมาจาก WebSocket จริง) ต้องเรียกผ่าน ref.current นี้แทนเพื่อให้ได้
  // closure ของ render ล่าสุดที่เห็น state ปัจจุบันจริงๆ
  const handleIdentifyWithCodeRef = useRef<(code: string) => void>(() => {});
  const handleCheckBookWithBarcodeRef = useRef<(barcode: string) => void>(() => {});

  // เล่นเสียง "ปี๊ป" แจ้งเตือนเมื่อสแกน RFID สำเร็จ (ใช้ Web Audio API ไม่ต้องพึ่งไฟล์เสียง)
  const playBeep = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.type = "sine";
      oscillator.frequency.value = 1000;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.error("Beep failed", e);
    }
  };

  // พูดข้อความด้วย Web Speech API ของเบราว์เซอร์ — ใช้เป็น fallback เวลายังไม่มีไฟล์เสียงจริง/โหลดไฟล์ไม่ได้
  const speak = (text: string) => {
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel(); // ตัดเสียงพูดก่อนหน้าที่ยังพูดไม่จบทิ้งไปก่อน กันพูดทับกันตอนเปลี่ยนหน้าเร็วๆ
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "th-TH";
      utter.rate = 1;
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.error("Speech synthesis failed", e);
    }
  };

  // เล่นไฟล์เสียงพูดที่อัดไว้ล่วงหน้าตามหน้าจอ/สถานะ (วางไฟล์ไว้ที่ public/sounds/<fileKey>.mp3)
  // ถ้ายังไม่มีไฟล์ หรือโหลด/เล่นไม่ได้ จะพูดด้วยเสียงสังเคราะห์ (speak) แทนไปก่อนโดยอัตโนมัติ
  // เปลี่ยนมาเป็นไฟล์เสียงจริงแทน Web Speech API ล้วนๆ เพราะคุณภาพ/สำเนียงเสียงอัดจริงจะดีกว่าเสียงสังเคราะห์ของเบราว์เซอร์
  const playVoice = (fileKey: string, fallbackText: string) => {
    if (!voiceEnabled) return; // ปิดเสียงพูดแนะนำไว้จากหน้า Dashboard
    try {
      if (!voiceAudioRef.current) voiceAudioRef.current = new Audio();
      const audio = voiceAudioRef.current;
      audio.pause();
      audio.currentTime = 0;
      audio.onerror = () => speak(fallbackText);
      audio.src = `/sounds/${fileKey}.mp3`;
      audio.play().catch(() => speak(fallbackText));
    } catch {
      speak(fallbackText);
    }
  };

  const runMotor = async (command: "open" | "dump" | "close", waitMs: number) => {
    setMotorLoading(true);
    try {
      await fetch(`${API}/dashboard/cabinet/${cabinetId}/motor/${command}`, { method: "POST" });
      const actualWaitMs = fastMode ? 1000 : waitMs;
      await new Promise(res => setTimeout(res, actualWaitMs));
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

  // ดึงข้อมูลสถานะและปริมาณความจุของตู้รับคืนหนังสือจากเซิร์ฟเวอร์ — ใช้ /api/cabinets/:id (คาบิเน็ตที่
  // เครื่องนี้ผูกอยู่) แทน /api/status เดิม (ตัวนั้นชี้ไปที่ตู้เริ่มต้น "cabinet-1" เสมอ ไม่ว่าแท็บเล็ต
  // เครื่องนี้จะตั้งค่าเป็นตู้ไหนก็ตาม ใช้ไม่ได้แล้วตอนมีหลายตู้) ไม่เริ่มดึงจนกว่าจะรู้ cabinetId ก่อน
  useEffect(() => {
    if (!cabinetId) return;
    const fetch_ = async () => {
      try {
        const res = await fetch(`${API}/cabinets/${cabinetId}`);
        const data = await res.json();
        setIsFull(!!data.is_full);
        setFastMode(data.fast_mode || false);
        setEsp32Connected(!!data.online);
        setCabinetActive(data.active !== false);
        // อัปเดตสถานะการทำงานของมอเตอร์จากข้อมูลที่ได้รับจากเซิร์ฟเวอร์
        setMotorOpen(data.motor_status === "open" || data.motor_status === "dump");

        // เช็คครั้งเดียวตอนเพิ่งโหลดหน้า (รวมถึงตอน reload อัตโนมัติจาก WebSocket หลุด) ว่ามอเตอร์
        // ค้างอยู่ตำแหน่งอื่นที่ไม่ใช่ปิดไหม — ถ้าหน้าเว็บ reload แปลว่า state ของรายการที่ทำอยู่
        // (ถ้ามี) หายไปแล้ว ไม่มีใครมาทำรายการต่อให้เสร็จได้ จึงปิดฝาตู้กลับให้ปลอดภัยไว้ก่อนเสมอ
        if (!initialMotorCheckedRef.current) {
          initialMotorCheckedRef.current = true;
          if (data.motor_status && data.motor_status !== "closed") {
            runMotor("close", 2083);
          }
        }
      } catch { }
    };
    fetch_();
    const t = setInterval(fetch_, 3000);
    return () => clearInterval(t);
  }, [cabinetId]);

  // ดึงค่าตั้งค่าตู้ (ระยะเวลารอเทหนังสือ/ระยะเวลา idle/เปิดปิดเสียง) จากเซิร์ฟเวอร์ครั้งเดียวตอนโหลดหน้า
  // ตั้งได้จากหน้า Dashboard แทนการ hardcode ไว้ในโค้ด
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/dashboard/system-settings`);
        const data = await res.json();
        if (typeof data.dump_settle_ms === "number") setDumpSettleMs(data.dump_settle_ms);
        if (typeof data.idle_timeout_ms === "number") setIdleTimeoutMs(data.idle_timeout_ms);
        if (typeof data.voice_enabled === "boolean") setVoiceEnabled(data.voice_enabled);
      } catch { }
    })();
  }, []);

  // เล่นเสียงพูดแนะนำทุกครั้งที่เปลี่ยนขั้นตอนหลัก ช่วยผู้ใช้ที่ไม่ถนัดอ่านหน้าจอ (ยกเว้นหน้าแรก "select-user"
  // ที่ไม่ต้องมีเสียง) — ชื่อไฟล์ตรงกับค่าของ step พอดี (เช่น public/sounds/check-book.mp3, drop.mp3, ...)
  useEffect(() => {
    const fallbackMessages: Partial<Record<Step, string>> = {
      "identify": "ยินดีต้อนรับเข้าสู่ระบบคืนหนังสือ โปรดสแกนบัตรนักศึกษาหรือพิมพ์เบอร์โทร เพื่อดำเนินการต่อ",
      "check-book": "กรุณาวางหนังสือที่ต้องการคืนทีละหนึ่งเล่ม โดยนำสันหนังสือเข้าด้านใน",
      "drop": "ตู้เปิดอยู่ กรุณากดยืนยันเพื่อคืนหนังสือเข้าตู้",
      "success": "คืนหนังสือสำเร็จแล้ว ขอบคุณที่ใช้บริการ",
      "not-found": "ไม่พบหนังสือในระบบ กรุณานำหนังสือไปติดต่อบรรณารักษ์ที่เคาน์เตอร์",
    };
    const fallbackText = fallbackMessages[step];
    if (fallbackText) playVoice(step, fallbackText);
  }, [step]);

  // เล่นเสียงแจ้งเตือนตอนตู้เต็ม (public/sounds/cabinet-full.mp3) — ขึ้นกับ isFull เท่านั้น
  // จึงเล่นครั้งเดียวตอนเพิ่งตรวจพบว่าเต็ม ไม่เล่นซ้ำทุก 3 วินาทีตามรอบ polling
  useEffect(() => {
    if (isFull) playVoice("cabinet-full", "ขออภัย ขณะนี้ตู้รับคืนหนังสือเต็มแล้ว กรุณาติดต่อบรรณารักษ์ที่เคาน์เตอร์");
  }, [isFull]);

  // เชื่อมต่อและจัดการข้อมูลการส่งสัญญาณจากระบบจำลอง (Simulator) ผ่าน WebSocket
  // ต่อใหม่อัตโนมัติถ้าหลุด (เช่น backend รีสตาร์ท/เน็ตกระตุก) ไม่งั้นถ้าหลุดแล้วค้างตลอด
  // จนกว่าจะรีเฟรชหน้าเอง จะทำให้ backend ส่ง RFID/barcode มาแต่หน้าเว็บไม่ได้รับอะไรเลย
  useEffect(() => {
    if (!cabinetId) return; // รอรู้ก่อนว่าแท็บเล็ตเครื่องนี้ผูกกับตู้ไหน ไม่งั้นต่อ WS แบบไม่ระบุตู้จะไปรับ
    // สัญญาณของตู้เริ่มต้น (cabinet-1) ปนกันไม่ได้

    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let failedAttempts = 0;
    // หลุดต่อเนื่องเกิน ~10 วินาที (5 ครั้ง x 2 วินาที) ให้รีโหลดหน้าทั้งหมดไปเลย ปลอดภัยกว่าปล่อยให้
    // หน้าเว็บค้างอยู่แบบดูเหมือนใช้งานได้แต่รับ RFID/บาร์โค้ดจากเซิร์ฟเวอร์ไม่ได้จริง
    const MAX_FAILED_ATTEMPTS_BEFORE_RELOAD = 5;

    const connect = () => {
      if (!active) return;
      // ผูก connection นี้กับตู้ที่เครื่องนี้ตั้งไว้ — backend กรองส่งแค่ RFID/บาร์โค้ดของตู้นี้มาให้
      // (ดู TabletWS ใน backend/internal/handlers/websocket.go)
      ws = new WebSocket(`${WS_BASE_URL}?cabinet=${encodeURIComponent(cabinetId)}`);

      ws.onopen = () => {
        failedAttempts = 0; // เชื่อมต่อสำเร็จ รีเซ็ตตัวนับใหม่

        // ส่ง ping ทุก 10 วินาที กัน NAT ของ hotspot มือถือตัด connection ที่เงียบไปเฉยๆ
        // (ปัญหาเดียวกับที่เจอกับ MQTT ของ ESP32 — connection ค้างแบบไม่มีข้อมูลวิ่งผ่านนานเกินไป
        // แล้วหลุดแบบที่ onclose ไม่ทันจับ ทำให้ต้องรีเฟรชหน้าเองก่อนจะกลับมาใช้ได้)
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, 10000);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        lastActivityRef.current = Date.now(); // ถือเป็นการใช้งานหน้าจอ กันตัวจับเวลา idle รีเซ็ตกลางคัน

        if (msg.type === "reset_setup") {
          // เจ้าหน้าที่กดปุ่ม "เคลียร์การตั้งค่าแท็บเล็ต" จากหน้า Dashboard ของตู้นี้ — ยืนยันมาจากฝั่ง
          // Dashboard แล้ว ไม่ต้องถาม confirm ซ้ำที่นี่อีก ล้างค่าแล้วกลับไปหน้าตั้งค่าทันที
          resetCabinetSetup();
          return;
        }

        if (msg.type === "barcode") {
          // จัดการเมื่อได้รับข้อมูลประเภท Barcode เพื่อระบุตัวตนผู้ใช้งาน
          setInputCode(msg.value);
          setStep((prev) => {
            if (prev === "identify") {
              // ประมวลผลและยืนยันตัวตนอัตโนมัติเมื่อได้รับข้อมูลที่ถูกต้อง
              // เรียกผ่าน ref เพื่อให้ได้ฟังก์ชันเวอร์ชันล่าสุด ไม่ใช่ closure ค้างจากตอน mount
              setTimeout(() => handleIdentifyWithCodeRef.current(msg.value), 100);
            }
            return prev;
          });
        }

        if (msg.type === "rfid") {
          // จัดการเมื่อได้รับข้อมูลประเภท RFID เพื่อตรวจสอบข้อมูลของหนังสือ
          // ไม่อัปเดตช่องแสดงผลตรงนี้ทันที — ให้ processScannedBarcodes เป็นคนอัปเดตเอง
          // เฉพาะตอนเจอหนังสือเล่มใหม่จริงๆ เท่านั้น กันค่าเล่มเก่า/ที่คืนไปแล้วโผล่ค้างอยู่ในช่อง
          setStep((prev) => {
            if (prev === "check-book") {
              // เสียงดังเฉพาะตอนเจอหนังสือเล่มใหม่จริงๆ (เช็คในฟังก์ชันประมวลผล) ไม่ใช่ทุกครั้งที่สแกน
              // เรียกผ่าน ref เพื่อให้ได้ฟังก์ชันเวอร์ชันล่าสุด (เห็นค่า borrower ปัจจุบันจริงๆ)
              setTimeout(() => handleCheckBookWithBarcodeRef.current(msg.value), 100);
            } else {
              // สแกนเข้ามาก่อนที่ตู้จะเปิดเสร็จ (ยังอยู่ขั้นตอน identify ระหว่างรอมอเตอร์)
              // เก็บไว้ก่อน แล้วค่อยประมวลผลทีหลังตอนเข้าสู่ขั้นตอนตรวจสอบหนังสือจริงๆ
              pendingRfidRef.current.push(msg.value);
            }
            return prev;
          });
        }
      };

      ws.onerror = () => console.log("WebSocket error");

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        if (!active) return;
        failedAttempts++;
        if (failedAttempts >= MAX_FAILED_ATTEMPTS_BEFORE_RELOAD) {
          console.log("WebSocket หลุดต่อเนื่องนานเกินไป กำลังรีโหลดหน้า...");
          window.location.reload();
          return;
        }
        reconnectTimer = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingInterval) clearInterval(pingInterval);
      ws?.close();
    };
  }, [cabinetId]);

  // ประมวลผล RFID ที่สแกนเข้ามาระหว่างรอ (ก่อนตู้เปิดเสร็จ) ทันทีที่เข้าสู่ขั้นตอนตรวจสอบหนังสือ
  useEffect(() => {
    if (step === "check-book" && pendingRfidRef.current.length > 0) {
      const pending = pendingRfidRef.current;
      pendingRfidRef.current = [];
      pending.forEach((value) => handleCheckBookWithBarcode(value));
    }
  }, [step]);

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


  // ดึงรายการหนังสือที่ผู้ใช้งานยังคงยืมอยู่ตาม OPAC แล้วกรองเล่มที่คืนเข้าตู้ไปแล้วออก
  // (OPAC อาจอัปเดตสถานะ "คืนแล้ว" ช้ากว่าความเป็นจริง เช่น เพิ่งคืนเข้าตู้ไปหมาดๆ แต่ OPAC
  // ยังไม่ sync ให้ หากไม่กรอง จะทำให้หนังสือที่คืนไปแล้วโผล่ค้างอยู่ในรายการ "ค้างส่ง" ซ้ำอีก)
  const fetchActiveBorrowsExcludingCabinet = async (barcode: string): Promise<PatronBorrow[]> => {
    const borrowRes = await fetch(`${API}/patron/${barcode}/borrows`);
    if (!borrowRes.ok) return [];
    const borrowData: PatronBorrow[] = await borrowRes.json();

    try {
      const cabinetRes = await fetch(`${API}/dashboard/books-in-cabinet`);
      if (cabinetRes.ok) {
        const cabinetData = await cabinetRes.json();
        const cabinetBarcodes = new Set((cabinetData.books || []).map((b: { barcode: string }) => b.barcode));
        return borrowData.filter(b => !cabinetBarcodes.has(b.BARCODE));
      }
    } catch { }
    return borrowData;
  };

  // กดปุ่ม "เริ่มต้น" — เช็คสถานะ ESP32 สดๆ อีกครั้งก่อนเข้าสู่ขั้นตอนระบุตัวตน (ไม่พึ่ง esp32Connected
  // ที่ polling ไว้ทุก 3 วินาทีเฉยๆ เพราะอาจมีช่วงหน่วงที่ state ยังไม่ทันอัปเดตตามจริง) ถ้าต่อไม่ได้
  // ให้ reload หน้าทั้งหมดทันที จะได้ reset ทุกอย่าง (WebSocket, state ค้าง) ให้ลองเชื่อมต่อใหม่สะอาดๆ
  // แทนที่จะปล่อยให้ผู้ใช้กดต่อไปแล้วมาเจอปัญหาตอนสแกนหนังสือทีหลัง
  const handleStart = async () => {
    if (fastMode) {
      setStep("identify");
      setInputCode("");
      setErrorMsg("");
      return;
    }
    try {
      const res = await fetch(`${API}/cabinets/${cabinetId}`);
      const data = await res.json();
      if (!data.online) {
        window.location.reload();
        return;
      }
    } catch {
      window.location.reload();
      return;
    }
    setStep("identify");
    setInputCode("");
    setErrorMsg("");
  };

  // ขั้นตอนที่ 1: ตรวจสอบข้อมูลเพื่อยืนยันตัวตนของผู้ใช้งานจากฐานข้อมูล
  const handleIdentify = async () => {
    const code = inputCode.trim();
    if (!code) {
      setErrorMsg("กรุณากรอกรหัสนักศึกษา เบอร์โทร หรือบัตรประชาชน");
      return;
    }
    setLoading(true);
    setErrorMsg("");

    // ถ้ารูปแบบเป็นเบอร์โทรศัพท์ (ขึ้นต้นด้วย 0 และมี 10 หลัก) ให้ถือว่าเป็น Guest ทันที
    if (code.match(/^0\d{9}$/)) {
      setBorrower({
        id: 0,
        code: code,
        name: "ผู้มาคืนหนังสือ",
        phone: code,
        type: "guest"
      });
      setActiveBorrows([]);
      await runMotor("open", 1042);
      setStep("check-book");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API}/borrower/code/${code}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg("ไม่พบรหัสผู้ใช้งาน กรุณาใส่เบอร์โทรหรือติดต่อบรรณารักษ์ที่เคาน์เตอร์");
        playVoice("identify-not-found", "ไม่พบรหัสผู้ใช้งาน กรุณาใส่เบอร์โทรหรือติดต่อบรรณารักษ์ที่เคาน์เตอร์");
        setLoading(false);
        return;
      }

      // แปลงข้อมูล PatronDetail ที่ได้จาก OPAC ให้อยู่ในรูป Borrower
      setBorrower({
        id: data.USERID || 0,
        code: data.BARCODE,
        name: `${data.FNAMETHAI || ''} ${data.LNAMETHAI || ''}`.trim(),
        phone: data.MOBILE || "",
        type: "member"
      });

      // ดึงข้อมูลรายการหนังสือที่ผู้ใช้งานรายดังกล่าวยังคงทำการยืมอยู่ (ไม่รวมเล่มที่คืนเข้าตู้ไปแล้ว)
      setActiveBorrows(await fetchActiveBorrowsExcludingCabinet(data.BARCODE));

      await runMotor("open", 1042);
      setStep("check-book");
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
    setLoading(false);
  };

  // คืนหนังสือทีละเล่ม: ใช้แค่ค่าที่เจอล่าสุดจากที่สแกนมา (ตัวท้ายสุดของข้อความ) เท่านั้น
  // เพราะเครื่องอ่าน RFID อาจจับสัญญาณหนังสือเล่มที่เพิ่งคืนไปแล้ว (ยังอยู่ในรัศมีก่อนถูกเทออก)
  // ติดมาพร้อมเล่มใหม่ในข้อความเดียวกันได้ ถ้าใช้ทั้งหมดจะทำให้เล่มเก่าโผล่ขึ้นมาซ้ำ
  const processScannedBarcodes = async (raw: string) => {
    // กันเรียกซ้อน — จำเป็นโดยเฉพาะกับเส้นทางที่ถูกยิงจาก WebSocket ตรงๆ (ไม่ผ่านปุ่ม/guardedAction)
    // เช่นเครื่องอ่าน RFID/บาร์โค้ดยิงสัญญาณซ้ำไวๆ ให้เรื่อยเดียวกัน จะได้ไม่บันทึกหลักฐาน "คืนผิดพลาด"
    // ซ้ำหลายแถว หรือสั่งปิดฝาซ้อนกัน
    if (processingScanRef.current) return;
    const barcodes = raw.split(/[\s,]+/).filter(b => b.trim() !== "");
    if (barcodes.length === 0) return;

    processingScanRef.current = true;
    const latest = barcodes[barcodes.length - 1].trim();

    setLoading(true);
    setErrorMsg("");

    try {
      // เช็คกับรายการ "หนังสือในตู้" จริงจากฐานข้อมูล (ตัวเดียวกับที่หน้า Dashboard ใช้แสดง)
      // ว่าเล่มนี้ถูกคืนเข้าตู้ไปแล้วหรือยัง กันเครื่องอ่านจับสัญญาณเล่มเดิมซ้ำขึ้นมาอีก — เช็คจาก
      // ฐานข้อมูลจริงแทนการจำไว้ในหน่วยความจำเบราว์เซอร์ จะกันซ้ำได้แม้หน้าเว็บ reload ไปแล้วก็ตาม
      const cabinetRes = await fetch(`${API}/dashboard/books-in-cabinet`);
      if (cabinetRes.ok) {
        const cabinetData = await cabinetRes.json();
        const alreadyInCabinet = (cabinetData.books || []).some((b: { barcode: string }) => b.barcode === latest);
        if (alreadyInCabinet) {
          return;
        }
      }

      const res = await fetch(`${API}/book/barcode/${latest}`);
      const data = await res.json();
      if (!res.ok) {
        // ไม่พบหนังสือในระบบ — บันทึกหลักฐานว่ามาคืนแล้วจริง ปิดฝาตู้ แล้วขึ้นหน้าแจ้งเตือนให้
        // ติดต่อบรรณารักษ์ (เหมือนหน้าตู้เต็ม แค่เปลี่ยนข้อความ) แทนการให้สแกนซ้ำเรื่อยๆ
        await recordFailedReturn(latest);
        await runMotor("close", 1042); // ตู้อยู่ที่ตำแหน่งเปิดอยู่ (check-book) ปิดจากเปิด = 1 ช่วงเท่านั้น
        setStep("not-found");
        return;
      } else {
        setBooksToReturn([data]); // แทนที่ด้วยเล่มล่าสุดเล่มเดียว ไม่สะสมหลายเล่ม
        setInputBarcode(latest); // โชว์แค่ค่าของเล่มที่จะคืนจริงๆ เท่านั้น (เล่มเก่า/ซ้ำไม่อัปเดตช่องนี้)
        playBeep(); // ดังเฉพาะตอนเจอหนังสือเล่มใหม่จริงๆ เท่านั้น (เล่มเก่าที่คืนไปแล้วไม่ดัง)
      }
    } catch {
      setErrorMsg(`${latest}: เกิดข้อผิดพลาด`);
    } finally {
      setLoading(false);
      processingScanRef.current = false;
    }
  };

  // ขั้นตอนที่ 2: ตรวจสอบข้อมูลรายละเอียดของหนังสือโดยใช้รหัส Barcode
  const handleCheckBook = async () => {
    await processScannedBarcodes(inputBarcode);
  };

  // บันทึกหลักฐานไว้ในระบบว่าผู้ใช้งานมาดำเนินการคืนหนังสือแล้วจริง แต่สแกนแล้วหาหนังสือในระบบไม่พบ
  // (กันไม่ให้ถูกเข้าใจผิดว่าไม่ได้มาคืน เผื่อบรรณารักษ์ต้องตรวจสอบย้อนหลังกับกล้องวงจรปิด)
  const recordFailedReturn = async (scannedBarcode: string) => {
    try {
      await fetch(`${API}/borrows/return-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower_code: borrower?.code || "",
          borrower_name: borrower?.name || "",
          returned_by_phone: borrower?.phone || "",
          scanned_barcode: scannedBarcode,
        }),
      });
    } catch { }
  };

  // ขั้นตอนที่ 3: ดำเนินการคืนหนังสือเข้าตู้ พร้อมบันทึกข้อมูลการคืนลงในฐานข้อมูล
  const handleDropBook = async () => {
    if (!borrower || booksToReturn.length === 0) return;
    setLoading(true);
    setErrorMsg("");
    try {
      // วนลูปบันทึกข้อมูลการคืนหนังสือทุกลงในระบบฐานข้อมูล
      for (const b of booksToReturn) {
        // หาวันที่ยืม/กำหนดคืนจริงของเล่มนี้จากรายการค้างส่งที่ดึงจาก OPAC ตอนระบุตัวตน
        // (ผู้ใช้ทั่วไป/Guest จะไม่มีรายการนี้เลย เพราะไม่มีการยืมผ่านระบบ OPAC)
        const activeBorrow = activeBorrows.find(ab => ab.BARCODE === b.barcode);
        const res = await fetch(`${API}/borrows/return`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            book_barcode: b.barcode,
            borrower_code: borrower?.code,
            borrower_name: borrower?.name || "",
            returned_by_phone: borrower?.phone || "",
            checkout_date: activeBorrow?.CHECKOUTDATE || "",
            due_date: activeBorrow?.DUEDATE || ""
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
      await runMotor("dump", 1042);

      // หน่วงเวลาเพื่อให้แน่ใจว่าหนังสือตกลงในตู้จัดเก็บอย่างสมบูรณ์ (ตั้งค่าได้จากหน้า Dashboard)
      setMotorLoading(true);
      await new Promise(resolve => setTimeout(resolve, fastMode ? 500 : dumpSettleMs));
      setMotorLoading(false);

      // สั่งการปิดตู้รับคืน (ยืดแกนชักจนสุด) และรอ 20 วินาที
      await runMotor("close", 2083);
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
      await runMotor("close", 1042);
    }
    pendingRfidRef.current = []; // ล้างสแกนค้างท่อ กันหลุดไปติดรายการของคนถัดไป
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
  const handleIdentifyWithCode = async (codeStr: string) => {
    const code = codeStr.trim();
    if (!code) return;
    setLoading(true);
    setErrorMsg("");

    if (code.match(/^0\d{9}$/)) {
      setBorrower({ id: 0, code: code, name: "ผู้มาคืนหนังสือ", phone: code, type: "guest" });
      setActiveBorrows([]);
      await runMotor("open", 1042);
      setStep("check-book");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API}/borrower/code/${code}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg("ไม่พบรหัสผู้ใช้งาน กรุณาใส่เบอร์โทรหรือติดต่อบรรณารักษ์ที่เคาน์เตอร์");
        playVoice("identify-not-found", "ไม่พบรหัสผู้ใช้งาน กรุณาใส่เบอร์โทรหรือติดต่อบรรณารักษ์ที่เคาน์เตอร์");
        setLoading(false);
        return;
      }
      
      setBorrower({
        id: data.USERID || 0,
        code: data.BARCODE,
        name: `${data.FNAMETHAI || ''} ${data.LNAMETHAI || ''}`.trim(),
        phone: data.MOBILE || "",
        type: "member"
      });

      setActiveBorrows(await fetchActiveBorrowsExcludingCabinet(data.BARCODE));

      await runMotor("open", 1042);
      setStep("check-book");
    } catch { setErrorMsg("เกิดข้อผิดพลาด"); }
    setLoading(false);
  };

  const handleCheckBookWithBarcode = async (barcode: string) => {
    await processScannedBarcodes(barcode);
  };

  // sync ref ให้ชี้ไปยังฟังก์ชันเวอร์ชันล่าสุดเสมอ (ไม่มี dependency array จึงรันหลังทุก render)
  useEffect(() => {
    handleIdentifyWithCodeRef.current = handleIdentifyWithCode;
    handleCheckBookWithBarcodeRef.current = handleCheckBookWithBarcode;
  });

  // จับเวลาไม่มีการใช้งาน (แทะจอ/กดปุ่ม/คีย์บอร์ด) — แตะหน้าจอหรือกดปุ่มใดๆ จะรีเซ็ตตัวจับเวลาใหม่
  useEffect(() => {
    const markActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener("pointerdown", markActivity);
    window.addEventListener("keydown", markActivity);
    return () => {
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
    };
  }, []);

  // ถ้าอยู่ขั้นตอนกลางทาง (ไม่ใช่หน้าแรก) แล้วไม่มีการใช้งานเกิน 10 วินาที ให้กลับหน้าแรกอัตโนมัติ
  // กันเครื่องค้างอยู่กลางขั้นตอนเพราะมีคนเดินออกไปโดยไม่กดอะไรต่อ — ไม่รีเซ็ตขณะกำลังรอมอเตอร์/
  // บันทึกข้อมูลอยู่ (loading/motorLoading) เพราะเป็นงานที่ดำเนินไปเองอัตโนมัติอยู่แล้ว ไม่ได้รอผู้ใช้ทำอะไรต่อ
  useEffect(() => {
    lastActivityRef.current = Date.now();
    const t = setInterval(() => {
      if (step === "select-user" || loading || motorLoading) return;
      if (Date.now() - lastActivityRef.current > idleTimeoutMs) {
        handleReset();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [step, loading, motorLoading, idleTimeoutMs]);

  const steps = [
    { key: "select-user", label: "เริ่มต้น" }, // เปลี่ยนจากคำว่า "เลือกผู้ใช้" เป็น "เริ่มต้น" เพื่อความเข้าใจที่ง่ายขึ้น
    { key: "identify", label: "ระบุตัวตน" },
    { key: "check-book", label: "ตรวจสอบหนังสือ" },
    { key: "drop", label: "หย่อนหนังสือ" },
    { key: "success", label: "เสร็จสิ้น" },
  ];
  const currentStepIndex = steps.findIndex((s) => s.key === step);



  // ยังไม่ได้เช็ค localStorage เสร็จ (เสี้ยววินาทีแรกตอนโหลดหน้า) — ปล่อยจอว่างไว้ก่อน กันโชว์หน้าจอ
  // ตั้งค่าตู้วาบขึ้นมาแวบเดียวทั้งที่จริงๆเครื่องนี้เคยตั้งค่าไว้แล้ว
  if (!cabinetIdReady) {
    return <div className="min-h-screen bg-gradient-to-b from-blue-950 to-blue-900" />;
  }

  // ยังไม่เคยตั้งค่ารหัสตู้ให้แท็บเล็ตเครื่องนี้เลย (เครื่องใหม่/ยังไม่ได้ติดตั้ง) — ให้กรอกครั้งเดียว
  // แล้วจำไว้ถาวรใน localStorage ไม่ต้องกรอกซ้ำทุกครั้งที่เปิดเครื่อง (ดูหน้า Dashboard สำหรับรายชื่อ
  // รหัสตู้ที่มีอยู่ในระบบ)
  if (!cabinetId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 to-blue-900 flex items-center justify-center p-4 select-none relative">
        <AnimatedBackground />
        <div className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-4xl">🏷️</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">ตั้งค่าเครื่องนี้</h2>
          <p className="text-gray-500 text-sm mb-6">
            กรอกรหัสตู้ที่แท็บเล็ตเครื่องนี้ติดตั้งอยู่ (ดูได้จากหน้า Dashboard ของเจ้าหน้าที่)<br />
            ตั้งครั้งเดียวเท่านั้น ระบบจะจำไว้ให้ถาวร
          </p>
          <input
            type="text"
            value={cabinetIdInput}
            onChange={(e) => setCabinetIdInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSetupCabinet(); }}
            placeholder="เช่น cabinet-1"
            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-lg text-center font-mono focus:outline-none focus:border-blue-500 transition mb-4"
            autoFocus
          />
          <button
            onClick={handleSetupCabinet}
            disabled={!cabinetIdInput.trim()}
            className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-lg transition"
          >
            เริ่มใช้งาน
          </button>
        </div>
      </div>
    );
  }

  // ตู้นี้ถูกปิดให้บริการชั่วคราวจากหน้า Dashboard — บล็อกการคืนหนังสือทั้งหมดจนกว่าจะเปิดกลับมา
  if (!cabinetActive) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 to-blue-900 flex flex-col select-none relative">
        <AnimatedBackground />
        <div className="relative z-10 flex flex-col flex-1">

          {/* Header */}
          <div className="bg-blue-950 px-10 py-6 flex justify-between items-center border-b border-blue-800 shadow-lg">
            <div className="flex items-center gap-5">
              <div className="bg-white rounded-full w-16 h-16 flex items-center justify-center p-2">
                <img src="/images/LOGO-RUTS-07-2-copy.png" alt="RUTS Logo" className="w-full h-full object-contain" onClick={handleLogoTap} />
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
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <p className="text-base text-yellow-300">ปิดให้บริการชั่วคราว</p>
              </div>
            </div>
          </div>

          {/* ส่วนแสดงหน้าจอแจ้งเตือนเมื่อตู้นี้ถูกปิดให้บริการชั่วคราวจากหน้า Dashboard */}
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 text-center flex flex-col justify-center min-h-[400px]">

              <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-5xl">⏸️</span>
              </div>

              <h2 className="text-3xl font-bold text-yellow-600 mb-3">
                ปิดให้บริการชั่วคราว
              </h2>

              <p className="text-gray-600 mb-2 text-xl font-semibold">
                ตู้นี้ถูกปิดให้บริการชั่วคราวอยู่
              </p>
              <p className="text-gray-500 text-lg mb-5">
                ไม่สามารถคืนหนังสือที่ตู้นี้ได้ในขณะนี้
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5 text-left">
                <p className="text-blue-700 font-bold text-lg mb-2">📋 กรุณาดำเนินการดังนี้</p>
                <ul className="text-blue-600 text-base space-y-2 pl-2">
                  <li>• คืนหนังสือที่ตู้อื่น หรือที่เคาน์เตอร์บริการโดยตรง</li>
                  <li>• ติดต่อบรรณารักษ์หากมีข้อสงสัย</li>
                </ul>
              </div>

              <p className="text-gray-400 text-sm">
                🔄 ระบบจะอัปเดตสถานะอัตโนมัติทุก 3 วินาที
                <br />หน้านี้จะกลับสู่ปกติเมื่อเปิดให้บริการตู้นี้อีกครั้ง
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

  // ตรวจสอบและแสดงผลหน้าจอแจ้งเตือน ในกรณีที่ตู้ไม่ได้ต่อกับ ESP32 (มอเตอร์/RFID) อยู่
  // (เช็คจาก MQTT Last Will/Testament ของ ESP32 ผ่าน backend ไม่ใช่แค่หน้าเว็บต่อ backend ได้เฉยๆ)
  // ข้ามเงื่อนไขนี้ถ้าเปิด Fast Mode ไว้ (ตั้งจากหน้า Simulator) เพื่อให้ทดสอบ flow การคืนหนังสือได้
  // ทั้งหมดโดยไม่ต้องมี ESP32 ต่ออยู่จริง
  if (!esp32Connected && !fastMode) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 to-blue-900 flex flex-col select-none relative">
        <AnimatedBackground />
        <div className="relative z-10 flex flex-col flex-1">

          {/* Header */}
          <div className="bg-blue-950 px-10 py-6 flex justify-between items-center border-b border-blue-800 shadow-lg">
            <div className="flex items-center gap-5">
              <div className="bg-white rounded-full w-16 h-16 flex items-center justify-center p-2">
                <img src="/images/LOGO-RUTS-07-2-copy.png" alt="RUTS Logo" className="w-full h-full object-contain" onClick={handleLogoTap} />
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
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <p className="text-base text-red-300">อุปกรณ์ไม่พร้อมใช้งาน</p>
              </div>
            </div>
          </div>

          {/* ส่วนแสดงหน้าจอแจ้งเตือนเมื่อ ESP32 ไม่ได้ต่ออยู่ */}
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 text-center flex flex-col justify-center min-h-[400px]">

              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-5xl">🔌</span>
              </div>

              <h2 className="text-3xl font-bold text-red-600 mb-3">
                ขณะนี้ตู้ไม่พร้อมใช้งาน
              </h2>

              <p className="text-gray-600 mb-2 text-xl font-semibold">
                เชื่อมต่อกับอุปกรณ์มอเตอร์/เครื่องอ่านไม่ได้
              </p>
              <p className="text-gray-500 text-lg mb-5">
                ไม่สามารถเปิดตู้หรือสแกนหนังสือได้ในขณะนี้
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5 text-left">
                <p className="text-blue-700 font-bold text-lg mb-2">📋 กรุณาดำเนินการดังนี้</p>
                <ul className="text-blue-600 text-base space-y-2 pl-2">
                  <li>• ติดต่อบรรณารักษ์ที่เคาน์เตอร์</li>
                  <li>• คืนหนังสือที่เคาน์เตอร์บริการโดยตรง</li>
                  <li>• รอจนกว่าเจ้าหน้าที่จะแก้ไขอุปกรณ์</li>
                </ul>
              </div>

              <p className="text-gray-400 text-sm">
                🔄 ระบบจะอัปเดตสถานะอัตโนมัติทุก 3 วินาที
                <br />หน้านี้จะกลับสู่ปกติเมื่อเชื่อมต่ออุปกรณ์ได้แล้ว
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
                <img src="/images/LOGO-RUTS-07-2-copy.png" alt="RUTS Logo" className="w-full h-full object-contain" onClick={handleLogoTap} />
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

  // ตรวจสอบและแสดงผลหน้าจอแจ้งเตือน ในกรณีที่สแกนหนังสือแล้วหาในระบบไม่พบ (RFID/Barcode เพี้ยน
  // หรือหนังสือไม่ได้อยู่ในฐานข้อมูล) — ปิดฝาตู้ไปแล้วตั้งแต่ตอนตรวจพบ บันทึกหลักฐานไว้ในระบบแล้วว่า
  // ผู้ใช้มาคืนจริง จึงให้ผู้ใช้กดกลับไปหน้าแรกเองเพื่อเริ่มทำรายการใหม่ (ไม่ auto refresh เหมือนตู้เต็ม
  // เพราะเป็นสถานะเฉพาะของรายการนี้ ไม่ใช่สถานะของตู้โดยรวม)
  if (step === "not-found") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 to-blue-900 flex flex-col select-none relative">
        <AnimatedBackground />
        <div className="relative z-10 flex flex-col flex-1">

          {/* Header */}
          <div className="bg-blue-950 px-10 py-6 flex justify-between items-center border-b border-blue-800 shadow-lg">
            <div className="flex items-center gap-5">
              <div className="bg-white rounded-full w-16 h-16 flex items-center justify-center p-2">
                <img src="/images/LOGO-RUTS-07-2-copy.png" alt="RUTS Logo" className="w-full h-full object-contain" onClick={handleLogoTap} />
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
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <p className="text-base text-red-300">ไม่พบหนังสือในระบบ</p>
              </div>
            </div>
          </div>

          {/* ส่วนแสดงหน้าจอแจ้งเตือนเมื่อสแกนหนังสือแล้วหาในระบบไม่พบ */}
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 text-center flex flex-col justify-center min-h-[400px]">

              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-5xl">❓</span>
              </div>

              <h2 className="text-3xl font-bold text-red-600 mb-3">
                ไม่พบหนังสือในระบบ
              </h2>

              <p className="text-gray-600 mb-2 text-xl font-semibold">
                ไม่สามารถตรวจสอบหนังสือเล่มนี้ได้
              </p>
              <p className="text-gray-500 text-lg mb-5">
                ระบบได้บันทึกไว้แล้วว่าท่านมาดำเนินการคืนหนังสือ
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5 text-left">
                <p className="text-blue-700 font-bold text-lg mb-2">📋 กรุณาดำเนินการดังนี้</p>
                <ul className="text-blue-600 text-base space-y-2 pl-2">
                  <li>• นำหนังสือเล่มนี้ไปติดต่อบรรณารักษ์ที่เคาน์เตอร์</li>
                  <li>• แจ้งเจ้าหน้าที่ว่าระบบสแกนหนังสือไม่พบ</li>
                  <li>• เจ้าหน้าที่จะตรวจสอบและบันทึกการคืนให้ท่านต่อไป</li>
                </ul>
              </div>

              <button
                onClick={handleReset}
                className="w-full bg-blue-700 hover:bg-blue-800 active:scale-95 text-white font-bold py-4 rounded-2xl text-xl transition shadow-lg"
              >
                🔄 กลับสู่หน้าแรก
              </button>
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
              <img src="/images/LOGO-RUTS-07-2-copy.png" alt="RUTS Logo" className="w-full h-full object-contain" onClick={handleLogoTap} />
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
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 flex flex-col relative min-h-[450px] h-full shrink-0 overflow-y-auto z-10 mx-auto">
            
            {/* Motor Loading Overlay for the Card */}
            {motorLoading && (
              <div className="absolute inset-0 z-50 bg-white/90 flex flex-col items-center justify-center backdrop-blur-sm">
                <div className="w-20 h-20 border-8 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6 shadow-lg"></div>
                <h2 className="text-2xl font-bold text-blue-900 mb-2">กรุณารอสักครู่...</h2>
                <p className="text-blue-600 text-lg animate-pulse font-medium text-center px-4">ระบบกำลังควบคุมมอเตอร์แกนชัก</p>
              </div>
            )}

            {/* คำแนะนำวิธีวางหนังสือ — แสดงทับหน้าตรวจสอบหนังสือไว้จนกว่าจะเจอหนังสือเล่มใหม่จริงๆ
                (booksToReturn ว่างอยู่ตราบใดที่ยังไม่เจอเล่มใหม่ รวมถึงตอนสแกนเจอเล่มที่คืนไปแล้วด้วย
                ซึ่งไม่ทำให้ booksToReturn เปลี่ยนแปลงอยู่แล้ว หน้าต่างนี้จึงไม่หายไปเองโดยไม่ต้องเพิ่ม logic อะไรเพิ่ม) */}
            {step === "check-book" && booksToReturn.length === 0 && (
              <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 text-center">
                <h2 className="text-5xl font-bold text-blue-900 mb-2">กรุณาคืนหนังสือทีละ 1 เล่ม</h2>
                <p className="text-gray-600 text-3xl mb-4">วางหนังสือโดยนำสันหนังสือเข้าตามรูป</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/returnExample.jpg"
                  alt="ตัวอย่างการวางหนังสือ"
                  className="max-w-full max-h-[70vh] w-auto h-auto rounded-2xl shadow-lg object-contain"
                />
                <button onClick={handleReset} className="mt-6 text-gray-400 hover:text-gray-600 text-xl py-2 px-6">
                  ← ยกเลิกและกลับหน้าแรก
                </button>
              </div>
            )}

            {/* ขั้นตอนที่ 1: หน้าจอเริ่มต้นระบบการรับคืนหนังสือ */}
            {step === "select-user" && (
              <div className="text-center flex-1 flex flex-col justify-center">
                <div className="text-6xl mb-6 soft-bounce">📚</div>
                <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-900 mb-3">ยินดีต้อนรับ</h2>
                <p className="text-gray-600 mb-2 text-xl font-semibold">ระบบรับคืนหนังสืออัตโนมัติ</p>
                <p className="text-gray-400 mb-8 text-base">Smart Library Return Station</p>
                <button onClick={guardedAction(handleStart)}
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
                  placeholder="รหัสนักศึกษา หรือ เบอร์โทร"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && guardedAction(handleIdentify)()}
                  className="w-full border-2 border-blue-200 rounded-2xl px-6 py-6 text-3xl text-center tracking-widest mb-4 focus:outline-none focus:border-blue-500 text-gray-800"
                />
                {errorMsg && <p className="text-red-500 text-sm mb-2">{errorMsg}</p>}
                <button onClick={guardedAction(handleIdentify)} disabled={loading}
                  className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 text-white font-bold py-6 rounded-2xl text-2xl transition mt-2">
                  {loading ? "⏳ กำลังตรวจสอบ..." : "ยืนยัน →"}
                </button>
                <button onClick={handleReset} className="w-full mt-2 text-gray-400 hover:text-gray-600 text-lg py-3">← ย้อนกลับ</button>
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
                  <p className="text-gray-500 text-base mb-2">สแกน Barcode ของหนังสือที่ต้องการคืนด้วยเครื่องอ่าน</p>
                  <input
                    id="input-check-book"
                    type="text"
                    readOnly
                    placeholder="รอการสแกนจากเครื่องอ่าน..."
                    value={inputBarcode}
                    onKeyDown={(e) => e.key === "Enter" && guardedAction(handleCheckBook)()}
                    className="w-full border-2 border-blue-200 rounded-2xl px-6 py-4 text-xl text-center tracking-widest mb-3 focus:outline-none focus:border-blue-500 text-gray-800 bg-gray-50 cursor-default"
                  />
                  {errorMsg && <p className="text-red-500 text-base mb-3">{errorMsg}</p>}
                  <div className="flex gap-3">
                    <button onClick={guardedAction(() => setStep("drop"))} disabled={booksToReturn.length === 0}
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
                  <button onClick={guardedAction(handleDropBook)} disabled={loading}
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
                      {booksToReturn.map((b, i) => <p key={i} className="text-gray-700 text-lg break-words">{b.title}</p>)}
                    </div>
                    {returnTime && (
                      <p className="text-gray-700 text-lg"><span className="text-gray-400">เวลา: </span>{returnTime.toLocaleString("th-TH")}</p>
                    )}
                  </div>


                </div>

                <div className="flex flex-col gap-3 flex-none mt-4">
                  {/* ปุ่มคำสั่งสำหรับการดำเนินการคืนหนังสือเล่มถัดไป ด้วยข้อมูลผู้ใช้งานเดิม */}
                  <button
                    onClick={guardedAction(async () => {
                      setBooksToReturn([]);
                      setInputBarcode("");
                      setErrorMsg("");
                      await runMotor("open", 1042);
                      setStep("check-book"); // ข้ามขั้นตอนไปสู่หน้าการตรวจสอบรหัสหนังสือ
                    })}
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
                          <div key={b.id} className="text-lg text-gray-800 border-b border-green-100 last:border-0 pb-1 break-words">
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