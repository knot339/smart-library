"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// แถบ navigation สำหรับสลับไปมาระหว่างหน้าฝั่งเจ้าหน้าที่/นักพัฒนา (ไม่ใส่ในหน้า "/" ที่เป็นจอคืน
// หนังสือสำหรับผู้ใช้ทั่วไป เพราะไม่ควรโชว์ลิงก์ไปหน้าควบคุมระบบให้คนทั่วไปเห็น)
const links = [
  { href: "/dashboard", label: "🖥️ แผงควบคุม" },
  { href: "/admin", label: "📋 จัดการข้อมูล" },
  { href: "/simulator", label: "🛠️ Simulator" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="bg-gray-950 flex gap-1 px-4 overflow-x-auto">
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition ${
              active
                ? "border-blue-400 text-white font-semibold"
                : "border-transparent text-gray-400 hover:text-white hover:border-gray-600"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
