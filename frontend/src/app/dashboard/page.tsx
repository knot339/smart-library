"use client";
import { useState, useEffect, useCallback } from "react";
import AviMjpegPlayer from "../../components/AviMjpegPlayer";
import { API_BASE_URL as API, CAMERA_FRONT_URL, CAMERA_INSIDE_URL, CAMERA_FRONT_RECORDINGS_URL, CAMERA_INSIDE_RECORDINGS_URL, CAMERA_FRONT_FILE_URL, CAMERA_INSIDE_FILE_URL } from "../../lib/config";

type MotorStatus = "closed" | "open" | "dump";
type BookInCabinet = {
    id: number; title: string; author: string;
    isbn: string; barcode: string; returned_at: string; returned_by: string; returned_by_phone?: string;
};


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
    const [activeCamera, setActiveCamera] = useState<"front" | "inside">("front");
    const [cameraTab, setCameraTab] = useState<"live" | "history">("live");
    const [confirmHistoryTab, setConfirmHistoryTab] = useState(false);
    const [recordings, setRecordings] = useState<{name: string, size: number, active: boolean}[]>([]);
    const [loadingRecordings, setLoadingRecordings] = useState(false);
    const [playingVideo, setPlayingVideo] = useState<string | null>(null);
    const [isFull, setIsFull] = useState(false);
    const [motorStatus, setMotorStatus] = useState<MotorStatus>("closed");
    const [cabinetOnline, setCabinetOnline] = useState(false);
    const [booksInCabinet, setBooksInCabinet] = useState<BookInCabinet[]>([]);
    const [loadingMotor, setLoadingMotor] = useState("");
    const [msg, setMsg] = useState({ text: "", type: "" });
    const [time, setTime] = useState("");
    const [confirmReset, setConfirmReset] = useState(false);

    const [fullScreenCamera, setFullScreenCamera] = useState<"front" | "inside" | null>(null);

    const notify = (text: string, type = "success") => {
        setMsg({ text, type });
        setTimeout(() => setMsg({ text: "", type: "" }), 3000);
    };

    useEffect(() => {
        const update = () => setTime(new Date().toLocaleTimeString("th-TH", {
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
            setIsFull(data.is_full);
            setMotorStatus(data.motor_status as MotorStatus);
            setCabinetOnline(true);
        } catch { setCabinetOnline(false); }
    }, []);

    const fetchBooks = useCallback(async () => {
        try {
            const res = await fetch(`${API}/dashboard/books-in-cabinet`);
            const data = await res.json();
            setBooksInCabinet(data.books || []);
        } catch { }
    }, []);

    useEffect(() => {
        fetchCabinet(); fetchBooks();
        const t = setInterval(() => {
            fetchCabinet(); fetchBooks();
        }, 5000);
        return () => clearInterval(t);
    }, [fetchCabinet, fetchBooks]);

    const fetchRecordings = useCallback(async (camera: "front" | "inside") => {
        setLoadingRecordings(true);
        const baseUrl = camera === "front" ? CAMERA_FRONT_RECORDINGS_URL : CAMERA_INSIDE_RECORDINGS_URL;
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
    }, []);

    useEffect(() => {
        if (cameraTab === "history") {
            fetchRecordings(activeCamera);
        }
    }, [cameraTab, activeCamera, fetchRecordings]);

    const sendMotorCommand = async (cmd: "open" | "close" | "dump") => {
        setLoadingMotor(cmd);
        try {
            const res = await fetch(`${API}/dashboard/motor/${cmd}`, { method: "POST" });
            const data = await res.json();
            setMotorStatus(data.motor_status as MotorStatus);
            notify(data.message);
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
        setLoadingMotor("");
    };

    const fmtDate = (d: string) =>
        d ? new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-";


    const motor = MOTOR_CONFIG[motorStatus];

    const handleResetCabinet = async () => {
        try {
            const res = await fetch(`${API}/dashboard/cabinet/reset`, { method: "POST" });
            const data = await res.json();
            setMotorStatus(data.motor_status as MotorStatus);
            setBooksInCabinet([]);
            notify("✅ " + data.message);
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
        setConfirmReset(false);
    };

    return (
        <div className="min-h-screen bg-gray-100">

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
                    </div>
                </div>
            </div>

            <div className="p-6 max-w-5xl mx-auto">

                {/* Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

                    {/* สถานะการเชื่อมต่อกับระบบฐานข้อมูลและเซิร์ฟเวอร์ */}
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

                    {/* ส่วนการดำเนินการล้างข้อมูลรายการหนังสือและความจุตู้รับคืน */}
                    <div className="mt-4 border-t pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-gray-700">🗂️ รีเซ็ตรายการในตู้</p>
                                <p className="text-xs text-gray-400">ใช้หลังจากเก็บหนังสือออกจากตู้แล้ว จะล้างรายการและความจุกลับเป็น 0</p>
                            </div>
                            <button
                                onClick={() => setConfirmReset(true)}
                                className="bg-red-500 hover:bg-red-600 text-white font-bold px-5 py-2 rounded-xl transition active:scale-95 whitespace-nowrap ml-4"
                            >
                                🗑️ รีเซ็ตรายการ
                            </button>
                        </div>
                    </div>
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
                                    src={CAMERA_FRONT_URL} 
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
                                    src={CAMERA_INSIDE_URL} 
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
                                                if (match) {
                                                    const [_, y, m, d, H, M, S] = match;
                                                    displayTime = `${d}/${m}/${y} ${H}:${M}:${S}`;
                                                }
                                                const fileBaseUrl = activeCamera === "front" ? CAMERA_FRONT_FILE_URL : CAMERA_INSIDE_FILE_URL;
                                                const fileUrl = `${fileBaseUrl}/recordings/file?file=${rec.name}`;

                                                return (
                                                    <tr key={rec.name} className="border-b last:border-0 hover:bg-blue-50/50 transition">
                                                        <td className="px-4 py-3 font-mono font-medium text-gray-700">{displayTime}</td>
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

                {/* ส่วนการแสดงผลข้อมูลรายการในตู้ */}
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <div className="bg-blue-50 px-6 py-4 border-b text-blue-900 font-bold">
                        📦 หนังสือในตู้ ({booksInCabinet.length} เล่ม)
                    </div>

                    <div className="overflow-x-auto">
                        {booksInCabinet.length === 0
                            ? <div className="text-center py-12 text-gray-400"><p className="text-4xl mb-2">📭</p><p>ไม่มีหนังสือในตู้ขณะนี้</p></div>
                            : <table className="w-full text-sm min-w-[600px]">
                                <thead className="bg-blue-50 text-blue-900">
                                    <tr>{["ชื่อหนังสือ", "ผู้แต่ง", "Barcode / ISBN", "คืนเมื่อ", "คืนโดย"].map(h => (
                                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                                    ))}</tr>
                                </thead>
                                <tbody>
                                    {booksInCabinet.map((b, i) => (
                                        <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                            <td className="px-4 py-3 font-medium text-gray-800">{b.title}</td>
                                            <td className="px-4 py-3 text-gray-600">{b.author}</td>
                                            <td className="px-4 py-3 font-mono text-gray-400 text-xs">{b.barcode}<br/>{b.isbn}</td>
                                            <td className="px-4 py-3 text-gray-500">{fmtDate(b.returned_at)}</td>
                                            <td className="px-4 py-3 text-gray-600 font-mono">{b.returned_by_phone || b.returned_by}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        }
                    </div>
                </div>

                <p className="text-center text-gray-400 text-xs mt-4">🔄 ข้อมูลอัปเดตอัตโนมัติทุก 5 วินาที</p>
            </div>
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
                        src={fullScreenCamera === "front" ? CAMERA_FRONT_URL : CAMERA_INSIDE_URL} 
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