export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080/api";
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_BASE_URL || "ws://localhost:8080/ws/tablet";

// ip ของกล้อง
export const CAMERA_FRONT_URL = process.env.NEXT_PUBLIC_CAMERA_FRONT_URL || ""; // กล้องหน้าตู้
export const CAMERA_INSIDE_URL = process.env.NEXT_PUBLIC_CAMERA_INSIDE_URL || ""; // กล้องในตู้

export const CAMERA_FRONT_RECORDINGS_URL = process.env.NEXT_PUBLIC_CAMERA_FRONT_RECORDINGS_URL || "";
export const CAMERA_INSIDE_RECORDINGS_URL = process.env.NEXT_PUBLIC_CAMERA_INSIDE_RECORDINGS_URL || "";

export const CAMERA_FRONT_FILE_URL = process.env.NEXT_PUBLIC_CAMERA_FRONT_FILE_URL || "";
export const CAMERA_INSIDE_FILE_URL = process.env.NEXT_PUBLIC_CAMERA_INSIDE_FILE_URL || "";
