"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AviMjpegPlayer from "../../components/AviMjpegPlayer";
import NavBar from "../../components/NavBar";
import { API_BASE_URL as API } from "../../lib/config";

type MotorStatus = "closed" | "open" | "dump";
type BookInCabinet = {
    id: number; title: string; author: string;
    isbn: string; barcode: string; returned_at: string;
    returned_by: string; returned_by_name?: string; returned_by_phone?: string;
};
type FailedReturnRecord = {
    id: number; borrower_code: string; borrower_name: string;
    book_title: string; book_barcode: string;
    returned_at: string | null; returned_by_phone: string; status: string;
};
type LineChannelData = { id: number; targets: string[]; token_configured: boolean };
type CameraInfo = { role: string; ip: string };
type CabinetSummary = {
    cabinet_id: string; name: string; active: boolean; online: boolean;
};

// การ์ดตั้งค่า LINE Official Account 1 ตัว — แยกเป็น component ของตัวเองเพราะแต่ละตัวมี draft
// (ช่อง token ที่กำลังพิมพ์ + รายการปลายทางที่กำลังแก้) เป็นอิสระจากตัวอื่น ไม่ปนกัน
function LineChannelCard({
    channel, onSave, onDelete, notify,
}: {
    channel: LineChannelData;
    onSave: (id: number, token: string, targets: string[]) => Promise<void>;
    onDelete: (id: number) => void;
    notify: (text: string, type?: string) => void;
}) {
    const [targetsDraft, setTargetsDraft] = useState<string[]>(channel.targets);
    const [targetInput, setTargetInput] = useState("");
    const [tokenInput, setTokenInput] = useState("");
    const [saving, setSaving] = useState(false);

    const addTarget = () => {
        const v = targetInput.trim();
        if (!v) return;
        if (!targetsDraft.includes(v)) setTargetsDraft([...targetsDraft, v]);
        setTargetInput("");
    };

    const handleSave = async () => {
        if (targetsDraft.length === 0) { notify("กรุณาเพิ่ม User/Group ID ปลายทางอย่างน้อย 1 รายการ", "error"); return; }
        setSaving(true);
        await onSave(channel.id, tokenInput.trim(), targetsDraft);
        setTokenInput("");
        setSaving(false);
    };

    return (
        <div className="border border-gray-200 rounded-xl p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-500">LINE OA #{channel.id}</span>
                <button onClick={() => onDelete(channel.id)} className="text-red-400 hover:text-red-600 text-xs font-semibold">ลบ</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Channel Access Token</label>
                    {channel.token_configured && (
                        <div className="mb-2">
                            {/* ขึ้นเป็นกล่อง/chip เหมือนรายการปลายทาง บอกแค่ว่ามีค่าตั้งไว้อยู่แล้ว ไม่โชว์ค่าจริง
                                (เทียบเท่ารหัสผ่าน) — ช่องด้านล่างไว้กรอกใหม่เฉพาะตอนต้องการเปลี่ยนเท่านั้น */}
                            <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 text-sm px-3 py-1 rounded-full">
                                🔑 ตั้งไว้แล้ว
                            </span>
                        </div>
                    )}
                    <input
                        type="text"
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        placeholder={channel.token_configured ? "กรอกเพื่อเปลี่ยน Token ใหม่" : "Channel Access Token"}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500 transition"
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">User / Group ID ปลายทาง</label>
                    <div className="flex flex-wrap gap-2 mb-2 min-h-[2rem]">
                        {targetsDraft.length === 0 && <span className="text-gray-300 text-sm">ยังไม่มีปลายทาง</span>}
                        {targetsDraft.map((t) => (
                            <span key={t} className="flex items-center gap-1 bg-green-50 text-green-700 text-sm px-3 py-1 rounded-lg font-mono max-w-full">
                                <span className="break-all">{t}</span>
                                <button onClick={() => setTargetsDraft(targetsDraft.filter(x => x !== t))} className="text-green-400 hover:text-green-700 font-bold ml-1 shrink-0">×</button>
                            </span>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={targetInput}
                            onChange={(e) => setTargetInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTarget(); } }}
                            placeholder="User ID หรือ Group ID"
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500 transition"
                        />
                        <button onClick={addTarget} className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-4 py-2 rounded-lg text-sm transition whitespace-nowrap">+ เพิ่ม</button>
                    </div>
                </div>
            </div>
            <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-lg text-sm transition"
            >
                {saving ? "⏳ กำลังบันทึก..." : "บันทึก"}
            </button>
        </div>
    );
}


const MOTOR_CONFIG: Record<MotorStatus, {
    icon: string; label: string; desc: string;
    cardBg: string; textColor: string;
}> = {
    closed: {
        icon: "🔒", label: "ปิด",
        desc: "แกนชักยืดสุด — ไม่รับหนังสือ",
        cardBg: "bg-blue-100", textColor: "text-blue-700",
    },
    open: {
        icon: "🔓", label: "เปิดรับหนังสือ",
        desc: "แกนชักหดบางส่วน — รับหนังสือได้",
        cardBg: "bg-green-100", textColor: "text-green-700",
    },
    dump: {
        icon: "📤", label: "กำลังเท",
        desc: "แกนชักหดสุด — เทหนังสือลงเก็บ",
        cardBg: "bg-orange-100", textColor: "text-orange-700",
    },
};

export default function DashboardPage() {
    const router = useRouter();

    // ระบบ login เดียวของทั้งระบบ (user/รหัสผ่านแยกรายคนจริง) — เช็คตอนโหลดหน้าว่า login อยู่ไหม และมี
    // สิทธิ์ can_access_dashboard ไหม ผ่าน /api/auth/me (เหมือนหน้า /admin) การป้องกันจริงๆของคำสั่งแก้ไข
    // ข้อมูลอยู่ที่ backend (RequireDashboardAccess) ตรงนี้แค่กันไม่ให้เห็นหน้าเพจเฉยๆถ้ายังไม่มีสิทธิ์
    const [authChecked, setAuthChecked] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API}/auth/me`, { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    if (!data.can_access_dashboard) {
                        router.replace(data.can_access_admin ? "/admin" : "/login?next=/dashboard");
                        return;
                    }
                } else {
                    router.replace("/login?next=/dashboard");
                    return;
                }
            } catch {
                router.replace("/login?next=/dashboard");
                return;
            }
            setAuthChecked(true);
        })();
    }, [router]);

    const handleDashboardLogout = async () => {
        try {
            await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
        } catch { }
        router.replace("/login?next=/dashboard");
    };

    // รายชื่อตู้ทั้งหมด (สำหรับแถบเลือกตู้ด้านบน) + ตู้ที่กำลังเลือกดูอยู่ตอนนี้
    const [cabinets, setCabinets] = useState<CabinetSummary[]>([]);
    const [selectedCabinetId, setSelectedCabinetId] = useState<string>("");
    const [togglingActive, setTogglingActive] = useState(false);
    const [resettingTablet, setResettingTablet] = useState(false);

    const [cabinetName, setCabinetName] = useState("");
    const [cabinetActive, setCabinetActive] = useState(true);
    const [cameras, setCameras] = useState<CameraInfo[]>([]);
    const [activeCamera, setActiveCamera] = useState<"front" | "inside">("front");
    const [cameraTab, setCameraTab] = useState<"live" | "history">("live");
    const [confirmHistoryTab, setConfirmHistoryTab] = useState(false);
    const [recordings, setRecordings] = useState<{name: string, size: number, active: boolean}[]>([]);
    const [loadingRecordings, setLoadingRecordings] = useState(false);
    const [borrowRecords, setBorrowRecords] = useState<FailedReturnRecord[]>([]);
    const [playingVideo, setPlayingVideo] = useState<string | null>(null);
    const [isFull, setIsFull] = useState(false);
    const [motorStatus, setMotorStatus] = useState<MotorStatus>("closed");
    const [cabinetOnline, setCabinetOnline] = useState(false);
    const [esp32Connected, setEsp32Connected] = useState(false);
    const [isLocked, setIsLocked] = useState(true);
    const [lockLoading, setLockLoading] = useState(false);
    const [booksInCabinet, setBooksInCabinet] = useState<BookInCabinet[]>([]);
    const [loadingMotor, setLoadingMotor] = useState("");
    const [msg, setMsg] = useState({ text: "", type: "" });
    const [time, setTime] = useState("");
    const [confirmReset, setConfirmReset] = useState(false);
    const [notifySettingsOpen, setNotifySettingsOpen] = useState(false);
    const [notifyView, setNotifyView] = useState<"menu" | "email" | "line">("menu");
    const [notifyEmails, setNotifyEmails] = useState<string[]>([]);
    const [emailDraft, setEmailDraft] = useState<string[]>([]);
    const [emailInput, setEmailInput] = useState("");
    const [savingEmail, setSavingEmail] = useState(false);
    const [lineChannels, setLineChannels] = useState<LineChannelData[]>([]);
    const [newLineToken, setNewLineToken] = useState("");
    const [newLineTargets, setNewLineTargets] = useState<string[]>([]);
    const [newLineTargetInput, setNewLineTargetInput] = useState("");
    const [addingLineChannel, setAddingLineChannel] = useState(false);

    const [systemSettingsOpen, setSystemSettingsOpen] = useState(false);
    const [dumpSettleSec, setDumpSettleSec] = useState(5);
    const [idleTimeoutSec, setIdleTimeoutSec] = useState(10);
    const [voiceEnabled, setVoiceEnabled] = useState(true);
    const [savingSystemSettings, setSavingSystemSettings] = useState(false);

    const [fullScreenCamera, setFullScreenCamera] = useState<"front" | "inside" | null>(null);

    const notify = (text: string, type = "success") => {
        setMsg({ text, type });
        setTimeout(() => setMsg({ text: "", type: "" }), 3000);
    };

    // ดึงรายชื่อตู้ทั้งหมดไว้ทำแถบเลือกด้านบน — ตู้แรกที่ได้มาจะถูกเลือกเป็นค่าเริ่มต้นอัตโนมัติ
    // ถ้ายังไม่เคยเลือกตู้ไหนมาก่อนเลย (selectedCabinetId ว่าง)
    const fetchCabinetList = useCallback(async () => {
        try {
            const res = await fetch(`${API}/cabinets`);
            const data = await res.json();
            const list: CabinetSummary[] = data.cabinets || [];
            setCabinets(list);
            setSelectedCabinetId((prev) => prev || (list[0]?.cabinet_id ?? ""));
        } catch { }
    }, []);

    useEffect(() => {
        fetchCabinetList();
        const t = setInterval(fetchCabinetList, 5000);
        return () => clearInterval(t);
    }, [fetchCabinetList]);

    // สร้าง URL ของกล้องแต่ละตัวจาก IP ที่กล้องลงทะเบียนไว้กับ backend เอง (POST /api/cabinets/register-camera)
    // แทนการ hardcode ผ่าน .env แบบเดิม — พอร์ตคงที่ตามที่ตั้งไว้ในเฟิร์มแวร์กล้อง (81=สตรีมสด,
    // 82=รายการวิดีโอย้อนหลัง, 83=โหลดไฟล์วิดีโอ) ถ้ายังไม่มีกล้อง role นั้นลงทะเบียนไว้ จะคืนค่าว่าง
    const cameraBaseUrl = useCallback((role: "front" | "inside", port: number): string => {
        const cam = cameras.find((c) => c.role === role);
        return cam ? `http://${cam.ip}:${port}` : "";
    }, [cameras]);

    useEffect(() => {
        const update = () => setTime(new Date().toLocaleTimeString("th-TH", {
            hour: "2-digit", minute: "2-digit", second: "2-digit",
        }));
        update();
        const t = setInterval(update, 1000);
        return () => clearInterval(t);
    }, []);

    const fetchCabinet = useCallback(async () => {
        if (!selectedCabinetId) return;
        try {
            // ใช้ /api/cabinets/:id แทน /api/status เดิม เพราะได้ข้อมูลครบกว่าในคำขอเดียว (online มาจาก MQTT
            // Last Will/Testament ของ ESP32 จริง, active บอกว่าตู้นี้เปิด/ปิดให้บริการอยู่, cameras คือ
            // รายการกล้องที่ลงทะเบียนไว้กับตู้นี้)
            const res = await fetch(`${API}/cabinets/${selectedCabinetId}`);
            if (!res.ok) throw new Error("not found");
            const data = await res.json();
            setCabinetName(data.name || selectedCabinetId);
            setCabinetActive(data.active !== false);
            setIsFull(!!data.is_full);
            setMotorStatus(data.motor_status as MotorStatus);
            setEsp32Connected(!!data.online);
            setIsLocked(!!data.is_locked);
            setCameras(data.cameras || []);
            setCabinetOnline(true);
        } catch { setCabinetOnline(false); setEsp32Connected(false); }
    }, [selectedCabinetId]);

    // books-in-cabinet/borrows ยังเป็น endpoint กลาง ไม่ได้แบ่งตามตู้ (BorrowRecord ในฐานข้อมูลยังไม่มี
    // คอลัมน์ cabinet_id) — ของเดิมเป็นแบบนี้มาก่อนแล้วตั้งแต่ยังเป็นระบบตู้เดียว ยังไม่ได้แก้ในเฟสนี้
    const fetchBooks = useCallback(async () => {
        try {
            const res = await fetch(`${API}/dashboard/books-in-cabinet`);
            const data = await res.json();
            setBooksInCabinet(data.books || []);
        } catch { }
    }, []);

    // ดึงรายการคืนทั้งหมด (รวมรายการ "คืนผิดพลาด") ไว้ใช้ทั้งแสดงการ์ดในหน้านี้ และจับคู่กับวิดีโอย้อนหลัง
    const fetchBorrowRecords = useCallback(async () => {
        try {
            const res = await fetch(`${API}/borrows`);
            if (res.ok) setBorrowRecords(await res.json());
        } catch { }
    }, []);

    useEffect(() => {
        fetchCabinet(); fetchBooks(); fetchBorrowRecords();
        const t = setInterval(() => {
            fetchCabinet(); fetchBooks(); fetchBorrowRecords();
        }, 5000);
        return () => clearInterval(t);
    }, [fetchCabinet, fetchBooks, fetchBorrowRecords]);

    // ดึงรายชื่ออีเมลแจ้งเตือนตู้เต็มที่ตั้งไว้ (ครั้งเดียวตอนโหลดหน้า ไม่ต้อง poll ซ้ำเหมือนสถานะตู้)
    // หมายเหตุ: การแจ้งเตือน/ตั้งค่าตู้ฝั่งแท็บเล็ตเป็นค่ากลางของทั้งระบบ ไม่ได้แยกตามตู้ (ตั้งใจออกแบบไว้
    // แบบนี้ตั้งแต่ Phase 1 เพื่อจำกัดขอบเขตงาน)
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API}/dashboard/notify-email`);
                const data = await res.json();
                setNotifyEmails(data.emails || []);
            } catch { }
        })();
    }, []);

    // เปิดหน้าแก้ไขอีเมล — คัดลอกรายการที่บันทึกไว้แล้วมาเป็นค่าตั้งต้นของฉบับร่างที่กำลังแก้
    const openEmailSettings = () => {
        setEmailDraft([...notifyEmails]);
        setEmailInput("");
        setNotifyView("email");
    };

    const addEmailDraft = () => {
        const v = emailInput.trim();
        if (!v) return;
        if (!v.includes("@")) { notify("อีเมลไม่ถูกต้อง", "error"); return; }
        if (!emailDraft.includes(v)) setEmailDraft([...emailDraft, v]);
        setEmailInput("");
    };

    const handleSaveNotifyEmail = async () => {
        if (emailDraft.length === 0) { notify("กรุณาเพิ่มอีเมลอย่างน้อย 1 รายการ", "error"); return; }
        setSavingEmail(true);
        try {
            const res = await fetch(`${API}/dashboard/notify-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ emails: emailDraft }),
            });
            const data = await res.json();
            if (res.ok) {
                setNotifyEmails(data.emails || emailDraft);
                notify("✅ บันทึกอีเมลแจ้งเตือนสำเร็จ");
                setNotifySettingsOpen(false);
            } else {
                notify(data.error || "เกิดข้อผิดพลาด", "error");
            }
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
        setSavingEmail(false);
    };

    // ดึงรายการ LINE Official Account ที่ตั้งไว้ทั้งหมด (รองรับหลายตัว แต่ละตัวมี Token/ปลายทางของตัวเอง)
    // ไม่ได้ค่า token กลับมาตรงๆ เพราะเทียบเท่ารหัสผ่าน รู้แค่ว่าตั้งไว้แล้วหรือยัง (token_configured)
    const fetchLineChannels = useCallback(async () => {
        try {
            const res = await fetch(`${API}/dashboard/notify-line`);
            const data = await res.json();
            setLineChannels(data.channels || []);
        } catch { }
    }, []);

    useEffect(() => { fetchLineChannels(); }, [fetchLineChannels]);

    const openLineSettings = () => {
        setNewLineToken("");
        setNewLineTargets([]);
        setNewLineTargetInput("");
        setNotifyView("line");
    };

    const handleSaveLineChannel = async (id: number, token: string, targets: string[]) => {
        try {
            const res = await fetch(`${API}/dashboard/notify-line/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ channel_access_token: token, targets }),
            });
            const data = await res.json();
            if (res.ok) {
                notify("✅ บันทึกการตั้งค่า LINE สำเร็จ");
                fetchLineChannels();
            } else {
                notify(data.error || "เกิดข้อผิดพลาด", "error");
            }
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
    };

    const handleDeleteLineChannel = async (id: number) => {
        try {
            await fetch(`${API}/dashboard/notify-line/${id}`, { method: "DELETE", credentials: "include" });
            notify("🗑️ ลบ LINE Official Account แล้ว");
            fetchLineChannels();
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
    };

    const addNewLineTarget = () => {
        const v = newLineTargetInput.trim();
        if (!v) return;
        if (!newLineTargets.includes(v)) setNewLineTargets([...newLineTargets, v]);
        setNewLineTargetInput("");
    };

    const handleAddLineChannel = async () => {
        const token = newLineToken.trim();
        if (!token) { notify("กรุณาระบุ Channel Access Token", "error"); return; }
        if (newLineTargets.length === 0) { notify("กรุณาเพิ่ม User/Group ID ปลายทางอย่างน้อย 1 รายการ", "error"); return; }
        setAddingLineChannel(true);
        try {
            const res = await fetch(`${API}/dashboard/notify-line`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ channel_access_token: token, targets: newLineTargets }),
            });
            const data = await res.json();
            if (res.ok) {
                notify("✅ เพิ่ม LINE Official Account สำเร็จ");
                setNewLineToken("");
                setNewLineTargets([]);
                setNewLineTargetInput("");
                fetchLineChannels();
            } else {
                notify(data.error || "เกิดข้อผิดพลาด", "error");
            }
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
        setAddingLineChannel(false);
    };

    // ดึงค่าตั้งค่าตู้ฝั่งแท็บเล็ต (ครั้งเดียวตอนโหลดหน้า) — backend เก็บเป็นมิลลิวินาที แปลงเป็นวินาที
    // ให้กรอกง่ายในฟอร์ม
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API}/dashboard/system-settings`);
                const data = await res.json();
                setDumpSettleSec(Math.round((data.dump_settle_ms ?? 5000) / 1000));
                setIdleTimeoutSec(Math.round((data.idle_timeout_ms ?? 10000) / 1000));
                setVoiceEnabled(data.voice_enabled !== false);
            } catch { }
        })();
    }, []);

    const openSystemSettings = () => setSystemSettingsOpen(true);

    const handleSaveSystemSettings = async () => {
        if (dumpSettleSec < 1 || dumpSettleSec > 60) { notify("ระยะเวลารอเทหนังสือต้องอยู่ระหว่าง 1-60 วินาที", "error"); return; }
        if (idleTimeoutSec < 3 || idleTimeoutSec > 300) { notify("ระยะเวลาไม่มีการใช้งานต้องอยู่ระหว่าง 3-300 วินาที", "error"); return; }
        setSavingSystemSettings(true);
        try {
            const res = await fetch(`${API}/dashboard/system-settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    dump_settle_ms: dumpSettleSec * 1000,
                    idle_timeout_ms: idleTimeoutSec * 1000,
                    voice_enabled: voiceEnabled,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                notify("✅ บันทึกการตั้งค่าตู้สำเร็จ");
                setSystemSettingsOpen(false);
            } else {
                notify(data.error || "เกิดข้อผิดพลาด", "error");
            }
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
        setSavingSystemSettings(false);
    };

    const fetchRecordings = useCallback(async (camera: "front" | "inside") => {
        setLoadingRecordings(true);
        const baseUrl = cameraBaseUrl(camera, 82);
        if (!baseUrl) { setRecordings([]); setLoadingRecordings(false); return; }
        try {
            const res = await fetch(`${baseUrl}/recordings`);
            if (res.ok) {
                const data = await res.json();
                const sorted = (data.files || []).sort((a: any, b: any) => b.name.localeCompare(a.name));
                setRecordings(sorted);
            } else {
                setRecordings([]);
            }
        } catch {
            setRecordings([]);
        }
        setLoadingRecordings(false);
    }, [cameraBaseUrl]);

    useEffect(() => {
        if (cameraTab === "history") {
            fetchRecordings(activeCamera);
        }
    }, [cameraTab, activeCamera, fetchRecordings]);

    // หาชื่อหนังสือที่มีเวลาคืนใกล้เคียงกับเวลาไฟล์วิดีโอที่สุด (ภายในช่วง 5 นาที) — ไม่มีการเชื่อม
    // ข้อมูลตรงๆ ระหว่างกล้องกับรายการคืนในระบบ จึงต้องจับคู่จากเวลาที่ใกล้เคียงกันเป็นหลัก
    const VIDEO_MATCH_TOLERANCE_MS = 5 * 60 * 1000;
    const findBookTitleForVideoTime = (videoTime: Date): string | null => {
        let closest: { title: string; diff: number } | null = null;
        for (const r of borrowRecords) {
            if (!r.returned_at) continue;
            const diff = Math.abs(new Date(r.returned_at).getTime() - videoTime.getTime());
            if (diff <= VIDEO_MATCH_TOLERANCE_MS && (!closest || diff < closest.diff)) {
                closest = { title: r.book_title, diff };
            }
        }
        return closest?.title || null;
    };

    const sendMotorCommand = async (cmd: "open" | "close" | "dump") => {
        setLoadingMotor(cmd);
        try {
            const res = await fetch(`${API}/dashboard/cabinet/${selectedCabinetId}/motor/${cmd}`, { method: "POST" });
            const data = await res.json();
            setMotorStatus(data.motor_status as MotorStatus);
            notify(data.message);
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
        setLoadingMotor("");
    };

    // สลับสถานะกลอนไฟฟ้าล็อกตู้ (คนละตัวกับมอเตอร์แกนชักที่รับหนังสือ)
    const handleToggleLock = async () => {
        setLockLoading(true);
        try {
            const res = await fetch(`${API}/dashboard/cabinet/${selectedCabinetId}/lock`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ locked: !isLocked }),
            });
            const data = await res.json();
            if (res.ok) {
                setIsLocked(!!data.is_locked);
                notify(data.message);
            } else {
                notify(data.error || "เกิดข้อผิดพลาด", "error");
            }
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
        setLockLoading(false);
    };

    // เปิด/ปิดให้บริการตู้ที่กำลังเลือกดูอยู่
    const handleToggleActive = async () => {
        setTogglingActive(true);
        try {
            const action = cabinetActive ? "deactivate" : "activate";
            const res = await fetch(`${API}/cabinets/${selectedCabinetId}/${action}`, { method: "POST", credentials: "include" });
            const data = await res.json();
            if (res.ok) {
                notify(data.message || "สำเร็จ");
                fetchCabinet();
                fetchCabinetList();
            } else {
                notify(data.error || "เกิดข้อผิดพลาด", "error");
            }
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
        setTogglingActive(false);
    };

    // สั่งแท็บเล็ตของตู้นี้ (ถ้าออนไลน์/เปิดหน้าเว็บอยู่) ให้ล้างรหัสตู้ที่บันทึกไว้แล้วกลับไปหน้าจอตั้งค่า
    // ใหม่ — ใช้ตอนตั้งรหัสตู้ผิดไปตอนติดตั้งแท็บเล็ต ไม่ต้องเดินไปแตะตัวเครื่องเอง (ถ้าแท็บเล็ตออฟไลน์อยู่
    // คำสั่งนี้จะไม่มีผล ต้องไปกดปุ่มโลโก้ 5 ครั้งที่ตัวเครื่องแทน — ข้อความตอบกลับจาก backend จะบอกไว้)
    const handleResetTablet = async () => {
        if (!window.confirm(`ต้องการล้างการตั้งค่าแท็บเล็ตของตู้ "${cabinetName || selectedCabinetId}" หรือไม่?\nแท็บเล็ตจะกลับไปหน้าจอให้กรอกรหัสตู้ใหม่ทันที (ถ้าออนไลน์อยู่)`)) return;
        setResettingTablet(true);
        try {
            const res = await fetch(`${API}/dashboard/cabinet/${selectedCabinetId}/reset-tablet`, { method: "POST", credentials: "include" });
            const data = await res.json();
            notify(data.message || "สำเร็จ", res.ok ? "success" : "error");
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
        setResettingTablet(false);
    };

    const fmtDate = (d: string) =>
        d ? new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-";

    // รายการที่มาคืนจริงแต่ระบบหาหนังสือที่สแกนได้ไม่พบ (ดูรายละเอียดเพิ่มเติม/แก้ไขได้ที่หน้า Admin)
    const failedReturns = borrowRecords.filter(r => r.status === "failed");

    const motor = MOTOR_CONFIG[motorStatus];

    const handleResetCabinet = async () => {
        try {
            const res = await fetch(`${API}/dashboard/cabinet/${selectedCabinetId}/reset`, { method: "POST", credentials: "include" });
            const data = await res.json();
            setMotorStatus(data.motor_status as MotorStatus);
            setBooksInCabinet([]);
            notify("✅ " + data.message);
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
        setConfirmReset(false);
    };

    const frontStreamUrl = cameraBaseUrl("front", 81) ? `${cameraBaseUrl("front", 81)}/stream` : "";
    const insideStreamUrl = cameraBaseUrl("inside", 81) ? `${cameraBaseUrl("inside", 81)}/stream` : "";

    if (!authChecked) return <div className="min-h-screen bg-gray-100" />;

    return (
        <div className="min-h-screen bg-gray-100">

            <NavBar />

            {/* Header */}
            <div className="bg-blue-900 text-white px-8 py-4 shadow-lg">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-700 rounded-full w-12 h-12 flex items-center justify-center text-2xl">🏛️</div>
                        <div>
                            <p className="text-blue-300 text-xs tracking-widest uppercase">Smart Library</p>
                            <h1 className="text-xl font-bold">แผงควบคุมพนักงาน</h1>
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row items-center gap-4">
                        {msg.text && (
                            <div className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${msg.type === "error" ? "bg-red-500" : "bg-green-500"}`}>
                                {msg.text}
                            </div>
                        )}
                        <div className="text-right">
                            <p className="text-blue-400 text-xs">เวลาปัจจุบัน</p>
                            <p className="font-mono font-bold text-lg">{time}</p>
                        </div>
                        <button
                            onClick={handleDashboardLogout}
                            className="bg-blue-800 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap"
                        >
                            ออกจากระบบ
                        </button>
                    </div>
                </div>
            </div>

            {/* แถบเลือกตู้ — แทนที่หน้ารวมรายชื่อตู้แยกต่างหากแบบเดิม ด้วยแถบแท็บเดียวให้สลับดูได้ในหน้าเดียว */}
            <div className="bg-white border-b shadow-sm sticky top-0 z-30">
                <div className="max-w-5xl mx-auto px-6 flex items-center gap-2 overflow-x-auto">
                    {cabinets.map((cab) => (
                        <button
                            key={cab.cabinet_id}
                            onClick={() => setSelectedCabinetId(cab.cabinet_id)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition ${
                                selectedCabinetId === cab.cabinet_id
                                    ? "border-blue-600 text-blue-700"
                                    : "border-transparent text-gray-500 hover:text-gray-700"
                            }`}
                        >
                            <span className={`w-2 h-2 rounded-full ${cab.online ? "bg-green-500" : "bg-red-400"}`} />
                            {cab.name || cab.cabinet_id}
                            {!cab.active && <span className="text-gray-300 text-xs">(ปิดบริการ)</span>}
                        </button>
                    ))}
                    {cabinets.length === 0 && (
                        <span className="text-gray-300 text-sm py-3">ยังไม่มีตู้ในระบบ</span>
                    )}
                </div>
            </div>

            {!cabinetActive && selectedCabinetId && (
                <div className="bg-yellow-100 border-b border-yellow-300 text-yellow-800 px-6 py-3 text-center text-sm font-semibold">
                    ⏸️ ตู้นี้ถูกปิดให้บริการชั่วคราวอยู่ — หน้าแท็บเล็ตของตู้นี้จะไม่รับคืนหนังสือจนกว่าจะเปิดให้บริการอีกครั้ง
                </div>
            )}

            {!selectedCabinetId ? (
                <div className="p-6 max-w-5xl mx-auto text-center text-gray-400 py-16">
                    {cabinets.length === 0 ? "ยังไม่มีตู้ในระบบ" : "⏳ กำลังโหลด..."}
                </div>
            ) : (
            <div className="p-6 max-w-5xl mx-auto">

                <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                    <h2 className="text-lg font-bold text-gray-700">{cabinetName || selectedCabinetId} <span className="text-gray-400 text-sm font-mono">({selectedCabinetId})</span></h2>
                    <div className="flex items-center gap-2">
                        {/* ใช้แก้ตอนตั้งรหัสตู้ผิดไปตอนติดตั้งแท็บเล็ต — สั่งผ่าน WebSocket ที่แท็บเล็ตต่อค้างไว้
                            (ถ้าออฟไลน์อยู่จะไม่มีผล ต้องไปกดปุ่มโลโก้ 5 ครั้งที่ตัวเครื่องแทน) */}
                        <button
                            onClick={handleResetTablet}
                            disabled={resettingTablet}
                            title="สั่งให้แท็บเล็ตของตู้นี้กลับไปหน้าจอตั้งค่ารหัสตู้ใหม่"
                            className="bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed text-gray-600 font-semibold px-4 py-2 rounded-lg text-sm transition whitespace-nowrap"
                        >
                            {resettingTablet ? "⏳ กำลังสั่ง..." : "🧹 เคลียร์การตั้งค่าแท็บเล็ต"}
                        </button>
                        <button
                            onClick={handleToggleActive}
                            disabled={togglingActive}
                            className={`${cabinetActive ? "bg-red-500 hover:bg-red-600" : "bg-green-600 hover:bg-green-700"} disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 rounded-lg text-sm transition whitespace-nowrap`}
                        >
                            {togglingActive ? "⏳ กำลังสั่ง..." : cabinetActive ? "⏸️ ปิดให้บริการชั่วคราว" : "▶️ เปิดให้บริการ"}
                        </button>
                    </div>
                </div>

                {/* Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

                    {/* สถานะการเชื่อมต่อกับ ESP32 (มอเตอร์/RFID) จริง — ไม่ใช่แค่ backend เว็บตอบกลับไหม
                        เช็คจาก esp32_connected (MQTT Last Will/Testament) ตัวเดียวกับที่หน้า tablet ใช้ */}
                    <div className="bg-white rounded-xl shadow p-5 flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${!cabinetOnline ? "bg-red-100" : esp32Connected ? "bg-green-100" : "bg-red-100"}`}>
                            {!cabinetOnline ? "❌" : esp32Connected ? "✅" : "🔌"}
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">การเชื่อมต่อ ESP32</p>
                            <p className={`text-lg font-bold ${!cabinetOnline ? "text-red-600" : esp32Connected ? "text-green-600" : "text-red-600"}`}>
                                {!cabinetOnline ? "Server Offline" : esp32Connected ? "Online" : "ESP32 ไม่เชื่อมต่อ"}
                            </p>
                        </div>
                    </div>

                    {/* สถานะการทำงานปัจจุบันของตู้รับคืนหนังสือ */}
                    <div className="bg-white rounded-xl shadow p-5 flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${motor.cardBg}`}>
                            {motor.icon}
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">สถานะตู้</p>
                            <p className={`text-lg font-bold ${motor.textColor}`}>{motor.label}</p>
                            <p className="text-gray-400 text-xs">{motor.desc}</p>
                        </div>
                    </div>

                    {/* สถานะปริมาณความจุของหนังสือภายในตู้รับคืน */}
                    <div className="bg-white rounded-xl shadow p-5">
                        <p className="text-gray-400 text-sm mb-3">สถานะความจุ</p>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${isFull ? "bg-red-100" : "bg-green-100"}`}>
                                    {isFull ? "🔴" : "🟢"}
                                </div>
                                <div>
                                    <p className={`text-lg font-bold ${isFull ? "text-red-600" : "text-green-600"}`}>
                                        {isFull ? "เต็ม" : "ไม่เต็ม"}
                                    </p>
                                    <p className="text-gray-400 text-xs">
                                        {isFull ? "ต้องนำหนังสือออก" : "สามารถรับหนังสือได้"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ปุ่มเปิดตั้งค่าการแจ้งเตือนตอนตู้เต็ม (อีเมล/LINE) กับตั้งค่าตู้ฝั่งแท็บเล็ต — แยกเป็นคนละ
                    การ์ดเพราะเป็นคนละเรื่องกัน (ย้ายรายละเอียดไปอยู่ในหน้าต่างแยกแทนการ์ดแยก 2 ใบเดิม
                    เพราะตอนนี้แต่ละช่องทางแจ้งเตือนรองรับหลายรายการ ใส่รวมในการ์ดเดียวจะรกเกินไป) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-xl shadow p-6 flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h2 className="text-lg font-bold text-gray-700 mb-1">🔔 การแจ้งเตือนตอนตู้เต็ม</h2>
                            <p className="text-gray-400 text-xs">
                                📧 อีเมล {notifyEmails.length} รายการ · 📱 LINE {lineChannels.length} บัญชี
                            </p>
                        </div>
                        <button
                            onClick={() => { setNotifyView("menu"); setNotifySettingsOpen(true); }}
                            className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-6 py-2 rounded-lg text-sm transition whitespace-nowrap"
                        >
                            ⚙️ ตั้งค่าการแจ้งเตือน
                        </button>
                    </div>
                    <div className="bg-white rounded-xl shadow p-6 flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h2 className="text-lg font-bold text-gray-700 mb-1">🛠️ ตั้งค่าตู้</h2>
                            <p className="text-gray-400 text-xs">ระยะเวลาต่างๆ และเสียงพูดแนะนำของหน้าแท็บเล็ต</p>
                        </div>
                        <button
                            onClick={openSystemSettings}
                            className="bg-gray-700 hover:bg-gray-800 text-white font-semibold px-6 py-2 rounded-lg text-sm transition whitespace-nowrap"
                        >
                            🛠️ ตั้งค่าตู้
                        </button>
                    </div>
                    {/* กลอนไฟฟ้าล็อกตู้ — คนละตัวกับมอเตอร์แกนชักที่รับหนังสือ (การ์ด "ควบคุมตู้รับคืน"
                        ด้านล่าง) ใช้ล็อก/ปลดล็อกฝาตู้ทั้งบาน สั่งแล้วมีผลทันที ไม่ต้องกดบันทึกแยก */}
                    <div className="bg-white rounded-xl shadow p-6 flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h2 className="text-lg font-bold text-gray-700 mb-1">{isLocked ? "🔒" : "🔓"} กลอนไฟฟ้าล็อกตู้</h2>
                            <p className="text-gray-400 text-xs">{isLocked ? "ล็อกอยู่" : "ปลดล็อกอยู่"}</p>
                        </div>
                        <button
                            onClick={handleToggleLock}
                            disabled={lockLoading}
                            className={`${isLocked ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"} disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-lg text-sm transition whitespace-nowrap`}
                        >
                            {lockLoading ? "⏳ กำลังสั่ง..." : isLocked ? "🔓 ปลดล็อก" : "🔒 ล็อก"}
                        </button>
                    </div>
                </div>

                {/* แผงควบคุมการทำงานของมอเตอร์ตู้รับคืนหนังสือ */}
                <div className="bg-white rounded-xl shadow p-6 mb-6">
                    <h2 className="text-lg font-bold text-gray-700 mb-2">🎛️ ควบคุมตู้รับคืน</h2>
                    <p className="text-gray-400 text-xs mb-4">เลือกสถานะที่ต้องการสั่งงานมอเตอร์แกนชัก</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                        {/* ปุ่มควบคุม: ปิดตู้รับคืน */}
                        <button
                            onClick={() => sendMotorCommand("close")}
                            disabled={loadingMotor !== "" || motorStatus === "closed"}
                            className="bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-5 rounded-xl transition active:scale-95 flex flex-col items-center gap-1"
                        >
                            <span className="text-3xl">🔒</span>
                            <span className="text-base">ปิดตู้</span>
                            <span className="text-xs font-normal opacity-80">แกนชักยืดสุด</span>
                        </button>

                        {/* ปุ่มควบคุม: เปิดรับหนังสือ */}
                        <button
                            onClick={() => sendMotorCommand("open")}
                            disabled={loadingMotor !== "" || motorStatus === "open"}
                            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-5 rounded-xl transition active:scale-95 flex flex-col items-center gap-1"
                        >
                            <span className="text-3xl">🔓</span>
                            <span className="text-base">เปิดรับหนังสือ</span>
                            <span className="text-xs font-normal opacity-80">แกนชักหดบางส่วน</span>
                        </button>

                        {/* ปุ่มควบคุม: เทหนังสือลงในตู้ */}
                        <button
                            onClick={() => sendMotorCommand("dump")}
                            disabled={loadingMotor !== "" || motorStatus === "dump"}
                            className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-5 rounded-xl transition active:scale-95 flex flex-col items-center gap-1"
                        >
                            <span className="text-3xl">📤</span>
                            <span className="text-base">เทหนังสือ</span>
                            <span className="text-xs font-normal opacity-80">แกนชักหดสุด</span>
                        </button>
                    </div>



                    {/* ส่วนแสดงสถานะการทำงานปัจจุบันของมอเตอร์ */}
                    <div className={`mt-4 rounded-lg px-4 py-3 flex items-center gap-3 ${motor.cardBg}`}>
                        <span className="text-xl">{motor.icon}</span>
                        <div>
                            <p className={`font-semibold text-sm ${motor.textColor}`}>สถานะปัจจุบัน: {motor.label}</p>
                            <p className="text-gray-500 text-xs">{motor.desc}</p>
                        </div>
                    </div>

                    <p className="text-gray-400 text-xs mt-3 text-center">
                        ⚠️ ตรวจสอบให้แน่ใจก่อนสั่งงานมอเตอร์ทุกครั้ง
                    </p>
                </div>

                {/* ส่วนการแสดงภาพจากกล้องวงจรปิด */}
                <div className="bg-white rounded-xl shadow p-6 mb-6">
                    <div className="flex flex-col md:flex-row items-center justify-between mb-4 gap-4">
                        <div className="flex items-center gap-4">
                            <h2 className="text-lg font-bold text-gray-700">📷 กล้องวงจรปิดตู้รับคืน</h2>
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setCameraTab("live")}
                                    className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${cameraTab === "live" ? "bg-white shadow text-blue-700" : "text-gray-500 hover:text-gray-700"}`}
                                >
                                    🔴 สด (Live)
                                </button>
                                <button
                                    onClick={() => setConfirmHistoryTab(true)}
                                    className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${cameraTab === "history" ? "bg-white shadow text-blue-700" : "text-gray-500 hover:text-gray-700"}`}
                                >
                                    📼 ย้อนหลัง
                                </button>
                            </div>
                        </div>
                        {cameraTab === "history" && (
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setActiveCamera("front")}
                                    className={`px-4 py-2 rounded-md text-sm font-semibold transition ${activeCamera === "front" ? "bg-white shadow text-blue-700" : "text-gray-500 hover:text-gray-700"}`}
                                >
                                    หน้าตู้
                                </button>
                                <button
                                    onClick={() => setActiveCamera("inside")}
                                    className={`px-4 py-2 rounded-md text-sm font-semibold transition ${activeCamera === "inside" ? "bg-white shadow text-blue-700" : "text-gray-500 hover:text-gray-700"}`}
                                >
                                    ในตู้
                                </button>
                            </div>
                        )}
                    </div>

                    {cameraTab === "live" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                            <div className="bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center relative w-full group">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={frontStreamUrl || "https://placehold.co/600x400?text=Camera+Not+Registered"}
                                    alt="Camera Front"
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = `https://placehold.co/600x400?text=Camera+Offline`;
                                    }}
                                />
                                <div className="absolute top-4 left-4 bg-black/50 text-white px-3 py-1 rounded-md text-xs backdrop-blur-sm shadow">
                                    🔴 LIVE: กล้องหน้าตู้
                                </div>
                                <button
                                    onClick={() => setFullScreenCamera("front")}
                                    className="absolute top-4 right-4 bg-black/50 hover:bg-black/80 text-white p-2 rounded-lg backdrop-blur-sm shadow transition opacity-100 md:opacity-0 md:group-hover:opacity-100"
                                    title="เต็มจอ"
                                >
                                    ⛶
                                </button>
                            </div>
                            <div className="bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center relative w-full group">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={insideStreamUrl || "https://placehold.co/600x400?text=Camera+Not+Registered"}
                                    alt="Camera Inside"
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = `https://placehold.co/600x400?text=Camera+Offline`;
                                    }}
                                />
                                <div className="absolute top-4 left-4 bg-black/50 text-white px-3 py-1 rounded-md text-xs backdrop-blur-sm shadow">
                                    🔴 LIVE: กล้องในตู้
                                </div>
                                <button
                                    onClick={() => setFullScreenCamera("inside")}
                                    className="absolute top-4 right-4 bg-black/50 hover:bg-black/80 text-white p-2 rounded-lg backdrop-blur-sm shadow transition opacity-100 md:opacity-0 md:group-hover:opacity-100"
                                    title="เต็มจอ"
                                >
                                    ⛶
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="border border-gray-200 rounded-xl overflow-hidden h-[450px] flex flex-col">
                            <div className="bg-gray-50 px-4 py-3 flex justify-between items-center border-b border-gray-200">
                                <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                    📼 ประวัติวิดีโอ - {activeCamera === "front" ? "กล้องหน้าตู้" : "กล้องในตู้"}
                                </h3>
                                <button
                                    onClick={() => fetchRecordings(activeCamera)}
                                    disabled={loadingRecordings}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1 disabled:opacity-50 bg-white border border-blue-200 px-3 py-1.5 rounded-lg shadow-sm"
                                >
                                    {loadingRecordings ? "⏳ กำลังโหลด..." : "🔄 รีเฟรชรายการ"}
                                </button>
                            </div>
                            <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-xs text-yellow-800 flex items-center gap-2">
                                <span className="text-lg">⚠️</span>
                                <span><strong>คำเตือน:</strong> การเปิดดู/รีเฟรชรายการนี้ หรือการเล่นวิดีโอ จะทำให้กล้องหยุดบันทึกช่วงเวลานั้นชั่วคราว</span>
                            </div>
                            <div className="flex-1 overflow-x-auto overflow-y-auto p-0 relative">
                                {recordings.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                        <div className="text-4xl mb-3">📁</div>
                                        <p>{loadingRecordings ? "กำลังโหลดประวัติวิดีโอ..." : "ไม่พบไฟล์วิดีโอย้อนหลัง หรือกล้องอาจออฟไลน์"}</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead className="bg-white sticky top-0 border-b shadow-sm z-10">
                                            <tr className="text-gray-600">
                                                <th className="px-4 py-3 text-left font-semibold">เวลาบันทึก</th>
                                                <th className="px-4 py-3 text-left font-semibold">ขนาดไฟล์</th>
                                                <th className="px-4 py-3 text-left font-semibold">สถานะ</th>
                                                <th className="px-4 py-3 text-right font-semibold">ดาวน์โหลด / เปิด</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recordings.map((rec) => {
                                                const match = rec.name.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.avi$/);
                                                let displayTime = rec.name;
                                                let matchedBookTitle: string | null = null;
                                                if (match) {
                                                    const [_, y, m, d, H, M, S] = match;
                                                    displayTime = `${d}/${m}/${y} ${H}:${M}:${S}`;
                                                    const videoDate = new Date(Number(y), Number(m) - 1, Number(d), Number(H), Number(M), Number(S));
                                                    matchedBookTitle = findBookTitleForVideoTime(videoDate);
                                                }
                                                const fileBaseUrl = cameraBaseUrl(activeCamera, 83);
                                                const fileUrl = `${fileBaseUrl}/recordings/file?file=${rec.name}`;

                                                return (
                                                    <tr key={rec.name} className="border-b last:border-0 hover:bg-blue-50/50 transition">
                                                        <td className="px-4 py-3 font-mono font-medium text-gray-700">
                                                            {displayTime}
                                                            {matchedBookTitle && (
                                                                <div className="text-xs text-blue-600 font-sans font-normal mt-0.5">📚 {matchedBookTitle}</div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-500">{(rec.size / (1024 * 1024)).toFixed(2)} MB</td>
                                                        <td className="px-4 py-3">
                                                            {rec.active ? (
                                                                <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold animate-pulse inline-flex items-center gap-1">
                                                                    <span className="w-2 h-2 bg-red-600 rounded-full"></span> กำลังบันทึก
                                                                </span>
                                                            ) : (
                                                                <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-medium">
                                                                    บันทึกเสร็จสิ้น
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            {rec.active ? (
                                                                <span className="text-gray-400 text-xs italic">ยังไม่สมบูรณ์</span>
                                                            ) : (
                                                                <div className="flex justify-end gap-2">
                                                                    <button
                                                                        onClick={() => setPlayingVideo(fileUrl)}
                                                                        className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1"
                                                                    >
                                                                        ▶️ เล่นวิดีโอ
                                                                    </button>
                                                                    <a
                                                                        href={fileUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1"
                                                                        title="ดาวน์โหลด (สำรองสำหรับเปิดใน VLC)"
                                                                    >
                                                                        ⬇️
                                                                    </a>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ส่วนการแสดงผลรายการที่มาคืนจริงแต่ระบบหาหนังสือที่สแกนได้ไม่พบ (หลักฐานไว้ให้บรรณารักษ์ตรวจสอบ) */}
                {failedReturns.length > 0 && (
                    <div className="bg-white rounded-xl shadow overflow-hidden mb-6">
                        <div className="bg-orange-50 px-6 py-4 border-b">
                            <span className="text-orange-900 font-bold">⚠️ รายการคืนผิดพลาด ({failedReturns.length} รายการ)</span>
                            <p className="text-orange-700 text-xs mt-1">มาคืนจริงแต่ระบบหาหนังสือที่สแกนได้ไม่พบ — ตรวจสอบรายละเอียด/ลบรายการได้ที่หน้า Admin</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[600px]">
                                <thead className="bg-orange-50/50 text-orange-900">
                                    <tr>{["เวลาที่มาคืน", "รหัสผู้คืน", "ชื่อผู้คืน", "เบอร์โทรผู้คืน"].map(h => (
                                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                                    ))}</tr>
                                </thead>
                                <tbody>
                                    {failedReturns.map((r, i) => (
                                        <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                            <td className="px-4 py-3 text-gray-500">{r.returned_at ? fmtDate(r.returned_at) : "-"}</td>
                                            <td className="px-4 py-3 font-mono text-gray-700">{r.borrower_code || "-"}</td>
                                            <td className="px-4 py-3 text-gray-700">{r.borrower_name || "-"}</td>
                                            <td className="px-4 py-3 font-mono text-gray-600">{r.returned_by_phone || "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ส่วนการแสดงผลข้อมูลรายการในตู้ */}
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <div className="bg-blue-50 px-6 py-4 border-b flex items-center justify-between gap-4">
                        <span className="text-blue-900 font-bold">📦 หนังสือในตู้ ({booksInCabinet.length} เล่ม)</span>
                        <button
                            onClick={() => setConfirmReset(true)}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-xl transition active:scale-95 whitespace-nowrap text-sm"
                            title="ใช้หลังจากเก็บหนังสือออกจากตู้แล้ว จะล้างรายการและความจุกลับเป็น 0"
                        >
                            🗑️ รีเซ็ตรายการในตู้
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        {booksInCabinet.length === 0
                            ? <div className="text-center py-12 text-gray-400"><p className="text-4xl mb-2">📭</p><p>ไม่มีหนังสือในตู้ขณะนี้</p></div>
                            : <table className="w-full text-sm min-w-[700px]">
                                <thead className="bg-blue-50 text-blue-900">
                                    <tr>{["ชื่อหนังสือ", "ผู้แต่ง", "Barcode", "คืนเมื่อ", "เลขผู้คืน", "ชื่อผู้คืน"].map(h => (
                                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                                    ))}</tr>
                                </thead>
                                <tbody>
                                    {booksInCabinet.map((b, i) => (
                                        <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                            <td className="px-4 py-3 font-medium text-gray-800">{b.title}</td>
                                            <td className="px-4 py-3 text-gray-600">{b.author}</td>
                                            <td className="px-4 py-3 font-mono text-gray-400 text-xs">{b.barcode}</td>
                                            <td className="px-4 py-3 text-gray-500">{fmtDate(b.returned_at)}</td>
                                            <td className="px-4 py-3 text-gray-600 font-mono">{b.returned_by_phone || b.returned_by || "-"}</td>
                                            <td className="px-4 py-3 text-gray-600">{b.returned_by_name || "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        }
                    </div>
                </div>

                <p className="text-center text-gray-400 text-xs mt-4">🔄 ข้อมูลอัปเดตอัตโนมัติทุก 5 วินาที</p>
            </div>
            )}
            {/* หน้าต่างตั้งค่าการแจ้งเตือนตอนตู้เต็ม — เลือกช่องทางจากเมนูก่อน แล้วค่อยเพิ่ม/ลบรายการ
                ปลายทางของช่องทางนั้นๆ ได้หลายรายการ (แทนการ์ดแยกที่ตรึงอยู่หน้าหลักตลอดเวลาแบบเดิม) */}
            {notifySettingsOpen && (
                <div
                    className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
                    onClick={() => setNotifySettingsOpen(false)}
                >
                    <div
                        className={`bg-white rounded-2xl shadow-2xl w-full p-6 ${notifyView === "line" ? "max-w-2xl" : "max-w-md"}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {notifyView === "menu" && (
                            <>
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-xl font-bold text-gray-800">ตั้งค่าการแจ้งเตือน</h3>
                                    <button
                                        onClick={() => setNotifySettingsOpen(false)}
                                        className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2"
                                    >×</button>
                                </div>
                                <p className="text-gray-400 text-xs mb-4">เลือกช่องทางที่ต้องการตั้งค่า</p>
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={openEmailSettings}
                                        className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-4 text-left transition"
                                    >
                                        <span className="flex items-center gap-3">
                                            <span className="text-2xl">📧</span>
                                            <span>
                                                <span className="block font-semibold text-gray-700">อีเมล</span>
                                                <span className="block text-xs text-gray-400">
                                                    {notifyEmails.length > 0 ? `${notifyEmails.length} รายการ` : "ยังไม่ได้ตั้งค่า"}
                                                </span>
                                            </span>
                                        </span>
                                        <span className="text-gray-300">→</span>
                                    </button>
                                    <button
                                        onClick={openLineSettings}
                                        className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-4 text-left transition"
                                    >
                                        <span className="flex items-center gap-3">
                                            <span className="text-2xl">📱</span>
                                            <span>
                                                <span className="block font-semibold text-gray-700">LINE</span>
                                                <span className="block text-xs text-gray-400">
                                                    {lineChannels.length > 0 ? `${lineChannels.length} บัญชี` : "ยังไม่ได้ตั้งค่า"}
                                                </span>
                                            </span>
                                        </span>
                                        <span className="text-gray-300">→</span>
                                    </button>
                                </div>
                            </>
                        )}

                        {notifyView === "email" && (
                            <>
                                <div className="flex items-center justify-between mb-1">
                                    <button
                                        onClick={() => setNotifyView("menu")}
                                        className="text-gray-400 hover:text-gray-600 text-sm"
                                    >← กลับ</button>
                                    <button
                                        onClick={() => setNotifySettingsOpen(false)}
                                        className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2"
                                    >×</button>
                                </div>
                                <h3 className="text-lg font-bold text-gray-700 mb-1">📧 แจ้งเตือนทางอีเมล</h3>
                                <p className="text-gray-400 text-xs mb-4">
                                    ระบบจะส่งอีเมลแจ้งเตือนไปทุกรายการด้านล่างนี้ ทุกครั้งที่ตู้เพิ่งเปลี่ยนจากว่างเป็นเต็ม
                                </p>

                                <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
                                    {emailDraft.length === 0 && <span className="text-gray-300 text-sm">ยังไม่มีอีเมล</span>}
                                    {emailDraft.map((e) => (
                                        <span key={e} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-lg max-w-full">
                                            <span className="break-all">{e}</span>
                                            <button
                                                onClick={() => setEmailDraft(emailDraft.filter(x => x !== e))}
                                                className="text-blue-400 hover:text-blue-700 font-bold ml-1 shrink-0"
                                            >×</button>
                                        </span>
                                    ))}
                                </div>

                                <div className="flex gap-2 mb-5">
                                    <input
                                        type="email"
                                        value={emailInput}
                                        onChange={(e) => setEmailInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmailDraft(); } }}
                                        placeholder="library@rmutsv.ac.th"
                                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition"
                                    />
                                    <button
                                        onClick={addEmailDraft}
                                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-4 py-2 rounded-lg text-sm transition whitespace-nowrap"
                                    >+ เพิ่ม</button>
                                </div>

                                <button
                                    onClick={handleSaveNotifyEmail}
                                    disabled={savingEmail}
                                    className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition"
                                >
                                    {savingEmail ? "⏳ กำลังบันทึก..." : "บันทึก"}
                                </button>
                            </>
                        )}

                        {notifyView === "line" && (
                            <>
                                <div className="flex items-center justify-between mb-1">
                                    <button
                                        onClick={() => setNotifyView("menu")}
                                        className="text-gray-400 hover:text-gray-600 text-sm"
                                    >← กลับ</button>
                                    <button
                                        onClick={() => setNotifySettingsOpen(false)}
                                        className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2"
                                    >×</button>
                                </div>
                                <h3 className="text-lg font-bold text-gray-700 mb-1">📱 แจ้งเตือนทาง LINE</h3>
                                <p className="text-gray-400 text-xs mb-4">
                                    รองรับหลาย LINE Official Account พร้อมกัน แต่ละบัญชีมี Channel Access Token
                                    และส่งไปคนละกลุ่ม/คนละปลายทางกันได้ (ต้องเปิดใช้ Messaging API แล้ว)
                                </p>

                                {lineChannels.map((ch) => (
                                    <LineChannelCard
                                        key={ch.id}
                                        channel={ch}
                                        onSave={handleSaveLineChannel}
                                        onDelete={handleDeleteLineChannel}
                                        notify={notify}
                                    />
                                ))}

                                <div className="border border-dashed border-gray-300 rounded-xl p-4">
                                    <p className="text-xs font-semibold text-gray-500 mb-3">+ เพิ่ม LINE Official Account ใหม่</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 mb-1">Channel Access Token</label>
                                            <input
                                                type="text"
                                                value={newLineToken}
                                                onChange={(e) => setNewLineToken(e.target.value)}
                                                placeholder="Channel Access Token"
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500 transition"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 mb-1">User / Group ID ปลายทาง</label>
                                            <div className="flex flex-wrap gap-2 mb-2 min-h-[2rem]">
                                                {newLineTargets.length === 0 && <span className="text-gray-300 text-sm">ยังไม่มีปลายทาง</span>}
                                                {newLineTargets.map((t) => (
                                                    <span key={t} className="flex items-center gap-1 bg-green-50 text-green-700 text-sm px-3 py-1 rounded-lg font-mono max-w-full">
                                                        <span className="break-all">{t}</span>
                                                        <button
                                                            onClick={() => setNewLineTargets(newLineTargets.filter(x => x !== t))}
                                                            className="text-green-400 hover:text-green-700 font-bold ml-1 shrink-0"
                                                        >×</button>
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={newLineTargetInput}
                                                    onChange={(e) => setNewLineTargetInput(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewLineTarget(); } }}
                                                    placeholder="User ID หรือ Group ID"
                                                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500 transition"
                                                />
                                                <button
                                                    onClick={addNewLineTarget}
                                                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-4 py-2 rounded-lg text-sm transition whitespace-nowrap"
                                                >+ เพิ่ม</button>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleAddLineChannel}
                                        disabled={addingLineChannel}
                                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition"
                                    >
                                        {addingLineChannel ? "⏳ กำลังเพิ่ม..." : "+ เพิ่ม OA นี้"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* หน้าต่างตั้งค่าตู้ฝั่งแท็บเล็ตคืนหนังสือ — ระยะเวลาต่างๆ และเปิด/ปิดเสียงพูดแนะนำ */}
            {systemSettingsOpen && (
                <div
                    className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
                    onClick={() => setSystemSettingsOpen(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-xl font-bold text-gray-800">🛠️ ตั้งค่าตู้</h3>
                            <button
                                onClick={() => setSystemSettingsOpen(false)}
                                className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2"
                            >×</button>
                        </div>
                        <p className="text-gray-400 text-xs mb-4">ค่าพวกนี้มีผลกับหน้าจอแท็บเล็ตคืนหนังสือโดยตรง</p>

                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                            ระยะเวลารอให้หนังสือตกลงในตู้ หลังเทเสร็จ (วินาที)
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={60}
                            value={dumpSettleSec}
                            onChange={(e) => setDumpSettleSec(Number(e.target.value))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition mb-4"
                        />

                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                            ไม่มีการใช้งานแล้วกลับหน้าแรกอัตโนมัติ (วินาที)
                        </label>
                        <input
                            type="number"
                            min={3}
                            max={300}
                            value={idleTimeoutSec}
                            onChange={(e) => setIdleTimeoutSec(Number(e.target.value))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition mb-4"
                        />

                        <label className="flex items-center gap-2 mb-5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={voiceEnabled}
                                onChange={(e) => setVoiceEnabled(e.target.checked)}
                                className="w-4 h-4"
                            />
                            <span className="text-sm text-gray-700">เปิดเสียงพูดแนะนำแต่ละขั้นตอนในหน้าคืนหนังสือ</span>
                        </label>

                        <button
                            onClick={handleSaveSystemSettings}
                            disabled={savingSystemSettings}
                            className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition"
                        >
                            {savingSystemSettings ? "⏳ กำลังบันทึก..." : "บันทึก"}
                        </button>
                    </div>
                </div>
            )}

            {/* หน้าต่างแจ้งเตือน (Modal) สำหรับยืนยันการล้างข้อมูลตู้รับคืน */}
            {confirmReset && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
                        <div className="text-5xl mb-4">🗑️</div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">ยืนยันรีเซ็ตรายการ?</h3>
                        <p className="text-gray-500 text-sm mb-6">
                            รายการหนังสือทั้งหมดในตู้จะถูกล้างออก<br />
                            และความจุจะกลับเป็น 0%<br />
                            <span className="text-red-500 font-semibold">กรุณาเก็บหนังสือออกก่อนกดยืนยัน</span>
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handleResetCabinet}
                                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition"
                            >
                                ✅ ยืนยัน รีเซ็ต
                            </button>
                            <button
                                onClick={() => setConfirmReset(false)}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition"
                            >
                                ยกเลิก
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* หน้าต่างยืนยันการเข้าสู่โหมดย้อนหลัง */}
            {confirmHistoryTab && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
                        <div className="text-5xl mb-4">⚠️</div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">ยืนยันเปิดดูประวัติ?</h3>
                        <p className="text-gray-500 text-sm mb-6">
                            การเข้าสู่โหมดย้อนหลังจะทำการ<span className="text-red-500 font-semibold">ตัดการเชื่อมต่อกล้องสด</span><br />
                            และอาจทำให้กล้องหยุดบันทึกวิดีโอชั่วคราวขณะโหลดข้อมูล
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setCameraTab("history");
                                    setConfirmHistoryTab(false);
                                }}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition"
                            >
                                ตกลง
                            </button>
                            <button
                                onClick={() => setConfirmHistoryTab(false)}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition"
                            >
                                ยกเลิก
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* หน้าต่างเล่นวิดีโอ */}

            {playingVideo && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                    <div className="w-full max-w-4xl max-h-full">
                        <AviMjpegPlayer src={playingVideo} onClose={() => setPlayingVideo(null)} />
                    </div>
                </div>
            )}

            {/* หน้าต่างดูกล้องสดเต็มจอ */}
            {fullScreenCamera && (
                <div className="fixed inset-0 bg-black z-[70] flex flex-col items-center justify-center p-0">
                    <button
                        onClick={() => setFullScreenCamera(null)}
                        className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white rounded-full w-12 h-12 flex items-center justify-center backdrop-blur-sm z-10 text-2xl transition"
                    >
                        ✕
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={(fullScreenCamera === "front" ? frontStreamUrl : insideStreamUrl) || "https://placehold.co/1280x720?text=Camera+Not+Registered"}
                        alt={`Camera Fullscreen ${fullScreenCamera}`}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://placehold.co/1280x720?text=Camera+Offline`;
                        }}
                    />
                    <div className="absolute top-4 left-4 bg-black/50 text-white px-4 py-2 rounded-lg text-sm backdrop-blur-sm shadow">
                        🔴 LIVE: {fullScreenCamera === "front" ? "กล้องหน้าตู้" : "กล้องในตู้"}
                    </div>
                </div>
            )}
        </div>
    );
}
