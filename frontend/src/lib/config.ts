// Backend รันอยู่เครื่องเดียวกับ frontend เสมอ (docker-compose เดียวกัน) จึงใช้ hostname เดียวกับที่
// เบราว์เซอร์เปิดหน้าเว็บอยู่แทนการ hardcode IP — กัน IP มหาลัยเปลี่ยนทุกรอบที่เชื่อมต่อใหม่
// (DHCP สุ่ม IP ใหม่) ไม่ต้องแก้ .env แล้ว build frontend ใหม่ทุกครั้งก่อนเปิดใช้งาน
// ถ้าตั้งค่า NEXT_PUBLIC_API_BASE_URL/WS_BASE_URL ไว้ใน .env จะยึดค่านั้นก่อนเสมอ (เผื่อ backend อยู่คนละเครื่อง)
const browserHost = typeof window !== "undefined" ? window.location.hostname : "localhost";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || `http://${browserHost}:8080/api`;
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_BASE_URL || `ws://${browserHost}:8080/ws/tablet`;

// NEXT_PUBLIC_CAMERA_*_URL ไม่ใช้แล้ว (Phase 4) — Dashboard ตอนนี้ดึง IP กล้องมาจาก backend เอง
// (GET /api/cabinets/:id -> cameras: [{role, ip}], มาจากที่กล้องแต่ละตัว self-register ไว้) แล้วสร้าง
// URL สตรีม/ประวัติวิดีโอขึ้นมาเองฝั่ง client เลย ไม่ต้อง hardcode ผ่าน .env + build ใหม่ทุกครั้งที่กล้อง
// เปลี่ยน IP อีกต่อไป ดู frontend/src/app/dashboard/[cabinetId]/page.tsx (cameraBaseUrl)
