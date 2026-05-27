"use client";
import { useState, useEffect, useCallback } from "react";

//const API = "http://localhost:8080/api";
const API = "http://10.183.255.90:8080/api";

type MotorStatus = "closed" | "open" | "dump";
type BookInCabinet = {
    id: number; title: string; author: string;
    isbn: string; returned_at: string; returned_by: string;
};
type ReturnRecord = {
    id: number; returned_at: string;
    book: { title: string; isbn: string };
    borrower: { name: string; code: string };
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
    const [capacity, setCapacity] = useState(0);
    const [isFull, setIsFull] = useState(false);
    const [motorStatus, setMotorStatus] = useState<MotorStatus>("closed");
    const [cabinetOnline, setCabinetOnline] = useState(false);
    const [booksInCabinet, setBooksInCabinet] = useState<BookInCabinet[]>([]);
    const [recentReturns, setRecentReturns] = useState<ReturnRecord[]>([]);
    const [loadingMotor, setLoadingMotor] = useState("");
    const [msg, setMsg] = useState({ text: "", type: "" });
    const [time, setTime] = useState("");
    const [tab, setTab] = useState<"books" | "history">("books");
    const [confirmReset, setConfirmReset] = useState(false);

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
            setCapacity(data.capacity);
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

    const fetchHistory = useCallback(async () => {
        try {
            const res = await fetch(`${API}/dashboard/recent-returns`);
            const data = await res.json();
            setRecentReturns(Array.isArray(data) ? data : []);
        } catch { }
    }, []);

    useEffect(() => {
        fetchCabinet(); fetchBooks(); fetchHistory();
        const t = setInterval(() => {
            fetchCabinet(); fetchBooks(); fetchHistory();
        }, 5000);
        return () => clearInterval(t);
    }, [fetchCabinet, fetchBooks, fetchHistory]);

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

    const capColor = capacity >= 100 ? "bg-red-500" : capacity >= 70 ? "bg-yellow-400" : "bg-green-500";
    const capText = capacity >= 100 ? "text-red-600" : capacity >= 70 ? "text-yellow-600" : "text-green-600";
    const motor = MOTOR_CONFIG[motorStatus];

    const handleResetCabinet = async () => {
        try {
            const res = await fetch(`${API}/dashboard/cabinet/reset`, { method: "POST" });
            const data = await res.json();
            setMotorStatus(data.motor_status as MotorStatus);
            setCapacity(0);
            setBooksInCabinet([]);
            notify("✅ " + data.message);
        } catch { notify("เกิดข้อผิดพลาด", "error"); }
        setConfirmReset(false);
    };

    return (
        <div className="min-h-screen bg-gray-100">

            {/* Header */}
            <div className="bg-blue-900 text-white px-8 py-4 shadow-lg">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-700 rounded-full w-12 h-12 flex items-center justify-center text-2xl">🏛️</div>
                        <div>
                            <p className="text-blue-300 text-xs tracking-widest uppercase">Smart Library</p>
                            <h1 className="text-xl font-bold">แผงควบคุมพนักงาน</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
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
                <div className="grid grid-cols-3 gap-4 mb-6">

                    {/* การเชื่อมต่อ */}
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
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${motor.cardBg}`}>
                            {motor.icon}
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">สถานะตู้</p>
                            <p className={`text-lg font-bold ${motor.textColor}`}>{motor.label}</p>
                            <p className="text-gray-400 text-xs">{motor.desc}</p>
                        </div>
                    </div>

                    {/* สถานะความจุตู้ */}
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

                {/* ควบคุมตู้ */}
                <div className="bg-white rounded-xl shadow p-6 mb-6">
                    <h2 className="text-lg font-bold text-gray-700 mb-2">🎛️ ควบคุมตู้รับคืน</h2>
                    <p className="text-gray-400 text-xs mb-4">เลือกสถานะที่ต้องการสั่งงานมอเตอร์แกนชัก</p>

                    <div className="grid grid-cols-3 gap-4">

                        {/* ปุ่มปิด */}
                        <button
                            onClick={() => sendMotorCommand("close")}
                            disabled={loadingMotor !== "" || motorStatus === "closed"}
                            className="bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-5 rounded-xl transition active:scale-95 flex flex-col items-center gap-1"
                        >
                            <span className="text-3xl">🔒</span>
                            <span className="text-base">ปิดตู้</span>
                            <span className="text-xs font-normal opacity-80">แกนชักยืดสุด</span>
                        </button>

                        {/* ปุ่มเปิด */}
                        <button
                            onClick={() => sendMotorCommand("open")}
                            disabled={loadingMotor !== "" || motorStatus === "open"}
                            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-5 rounded-xl transition active:scale-95 flex flex-col items-center gap-1"
                        >
                            <span className="text-3xl">🔓</span>
                            <span className="text-base">เปิดรับหนังสือ</span>
                            <span className="text-xs font-normal opacity-80">แกนชักหดบางส่วน</span>
                        </button>

                        {/* ปุ่มเท */}
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



                    {/* แสดงสถานะปัจจุบัน */}
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

                    {/* ปุ่มรีเซ็ตรายการในตู้ */}
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

                {/* Tab */}
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <div className="flex border-b">
                        {([["books", `📦 หนังสือในตู้ (${booksInCabinet.length} เล่ม)`],
                        ["history", `🕐 ประวัติการคืน (${recentReturns.length} รายการ)`]] as const).map(([key, label]) => (
                            <button key={key} onClick={() => setTab(key)}
                                className={`flex-1 py-4 font-semibold transition ${tab === key ? "bg-blue-50 text-blue-700 border-b-2 border-blue-700" : "text-gray-500 hover:text-gray-700"}`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* หนังสือในตู้ */}
                    {tab === "books" && (
                        booksInCabinet.length === 0
                            ? <div className="text-center py-12 text-gray-400"><p className="text-4xl mb-2">📭</p><p>ไม่มีหนังสือในตู้ขณะนี้</p></div>
                            : <table className="w-full text-sm">
                                <thead className="bg-blue-50 text-blue-900">
                                    <tr>{["ชื่อหนังสือ", "ผู้แต่ง", "ISBN", "คืนเมื่อ", "คืนโดย"].map(h => (
                                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                                    ))}</tr>
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

                    {/* ประวัติการคืน */}
                    {tab === "history" && (
                        recentReturns.length === 0
                            ? <div className="text-center py-12 text-gray-400"><p className="text-4xl mb-2">📋</p><p>ยังไม่มีประวัติการคืน</p></div>
                            : <table className="w-full text-sm">
                                <thead className="bg-blue-50 text-blue-900">
                                    <tr>{["ชื่อหนังสือ", "ISBN", "ผู้คืน", "รหัส", "วันที่คืน"].map(h => (
                                        <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                                    ))}</tr>
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

                <p className="text-center text-gray-400 text-xs mt-4">🔄 ข้อมูลอัปเดตอัตโนมัติทุก 5 วินาที</p>
            </div>
            {/* Modal ยืนยันรีเซ็ต */}
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
        </div>
    );
}