"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE_URL as API } from "../../lib/config";

// หน้า login เดียวของทั้งระบบ (user/รหัสผ่านแยกรายคนจริง บังคับที่ backend) ใช้ทั้งหน้า /dashboard
// และ /admin — แต่ละบัญชีมีสิทธิ์เข้าแต่ละหน้าแยกกันได้ (ตั้งค่าได้ที่แท็บ "บัญชีผู้ใช้" ใน /admin)
// อ่าน query param "next" เพื่อรู้ว่า login สำเร็จแล้วจะพาไปหน้าไหน (ไม่ใส่มา default เป็น /dashboard)
// credentials:"include" จำเป็นเสมอ เพราะ login ไปที่ backend (คนละพอร์ตกับหน้านี้) ต้องส่ง/รับ cookie
// ข้าม origin ได้ (ดู backend/cmd/server/main.go เรื่อง CORS + AllowCredentials)
function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const next = searchParams.get("next") || "/dashboard";

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${API}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ username, password }),
            });
            if (res.ok) {
                router.replace(next);
            } else {
                const data = await res.json().catch(() => ({}));
                setError(data.error || "เข้าสู่ระบบไม่สำเร็จ");
            }
        } catch {
            setError("เชื่อมต่อ server ไม่ได้ ลองใหม่อีกครั้ง");
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
                <div className="text-center mb-6">
                    <div className="bg-indigo-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-3 text-3xl">👤</div>
                    <h1 className="text-xl font-bold text-gray-800">เข้าสู่ระบบ</h1>
                    <p className="text-gray-400 text-sm mt-1">สำหรับเจ้าหน้าที่ที่มีบัญชีผู้ใช้เท่านั้น</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Username</label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoFocus
                        className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-indigo-500 transition mb-3"
                    />
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-indigo-500 transition mb-3"
                    />
                    {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
                    <button
                        type="submit"
                        disabled={loading || !username || !password}
                        className="w-full bg-indigo-700 hover:bg-indigo-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-lg transition"
                    >
                        {loading ? "⏳ กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}
