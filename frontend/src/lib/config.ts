// Backend รันอยู่เครื่องเดียวกับ frontend เสมอ (docker-compose เดียวกัน) จึงใช้ hostname เดียวกับที่
// เบราว์เซอร์เปิดหน้าเว็บอยู่แทนการ hardcode IP — กัน IP มหาลัยเปลี่ยนทุกรอบที่เชื่อมต่อใหม่
// (DHCP สุ่ม IP ใหม่) ไม่ต้องแก้ .env แล้ว build frontend ใหม่ทุกครั้งก่อนเปิดใช้งาน
// ถ้าตั้งค่า NEXT_PUBLIC_API_BASE_URL/WS_BASE_URL ไว้ใน .env จะยึดค่านั้นก่อนเสมอ (เผื่อ backend อยู่คนละเครื่อง)
const browserHost = typeof window !== "undefined" ? window.location.hostname : "localhost";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || `http://${browserHost}:8080/api`;
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_BASE_URL || `ws://${browserHost}:8080/ws/tablet`;

// ip ของกล้อง
export const CAMERA_FRONT_URL = process.env.NEXT_PUBLIC_CAMERA_FRONT_URL || ""; // กล้องหน้าตู้
export const CAMERA_INSIDE_URL = process.env.NEXT_PUBLIC_CAMERA_INSIDE_URL || ""; // กล้องในตู้

export const CAMERA_FRONT_RECORDINGS_URL = process.env.NEXT_PUBLIC_CAMERA_FRONT_RECORDINGS_URL || "";
export const CAMERA_INSIDE_RECORDINGS_URL = process.env.NEXT_PUBLIC_CAMERA_INSIDE_RECORDINGS_URL || "";

export const CAMERA_FRONT_FILE_URL = process.env.NEXT_PUBLIC_CAMERA_FRONT_FILE_URL || "";
export const CAMERA_INSIDE_FILE_URL = process.env.NEXT_PUBLIC_CAMERA_INSIDE_FILE_URL || "";
