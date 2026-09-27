"use client";
import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL as API } from "../../lib/config";

// ---- ประเภทข้อมูลที่ใช้ภายในระบบ (Types) ----
type Book = { id: number; isbn: string; barcode: string; bibid: string; title: string; author: string; category: string; stock: number; callno: string; mattypeid: number };
type Borrower = { id: number; code: string; name: string; type: string; phone: string };
type BorrowRecord = {
  id: number;
  borrower_code: string;
  book_barcode: string;
  book_title: string;
  book_author: string;
  borrowed_at: string;
  due_date: string;
  returned_at: string | null;
  returned_by_phone: string;
  status: string;
};
type Tab = "books" | "borrowers" | "borrows";

const emptyBook = { isbn: "", barcode: "", bibid: "", title: "", author: "", category: "", callno: "", mattypeid: 1, stock: 1 };
const emptyBorrower = { code: "", name: "", type: "student", phone: "" };
const emptyBorrow = { borrower_id: "", book_id: "" };

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("books");

  // ---- สถานะสำหรับจัดการข้อมูลหนังสือ ----
  const [books, setBooks] = useState<Book[]>([]);
  const [bookForm, setBookForm] = useState(emptyBook);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [bookModal, setBookModal] = useState(false);
  const [bookPage, setBookPage] = useState(1);
  const [bookTotal, setBookTotal] = useState(0);
  const [bookSearchInput, setBookSearchInput] = useState("");
  const [bookSearch, setBookSearch] = useState("");
  const bookLimit = 50;
  const bookTotalPages = Math.max(1, Math.ceil(bookTotal / bookLimit));

  // ---- สถานะสำหรับจัดการข้อมูลผู้ยืม ----
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [borrowerForm, setBorrowerForm] = useState(emptyBorrower);
  const [editingBorrower, setEditingBorrower] = useState<Borrower | null>(null);
  const [borrowerModal, setBorrowerModal] = useState(false);

  // ---- สถานะสำหรับจัดการข้อมูลการยืม-คืน ----
  const [borrows, setBorrows] = useState<BorrowRecord[]>([]);
  const [borrowForm, setBorrowForm] = useState(emptyBorrow);
  const [borrowModal, setBorrowModal] = useState(false);

  const [msg, setMsg] = useState({ text: "", type: "" });

  const notify = (text: string, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "" }), 3000);
  };

  // ---- ฟังก์ชันสำหรับดึงข้อมูลจากเซิร์ฟเวอร์ ----
  // ตาราง books มีข้อมูลจากห้องสมุดจริงหลักแสนแถว จึงต้องดึงแบบแบ่งหน้า (page/limit)
  // ไม่งั้นดึงทั้งหมดมาทีเดียวจะทำให้หน้า Admin โหลดช้า/ค้าง
  const fetchBooks = useCallback(async (page: number, search: string) => {
    const params = new URLSearchParams({ page: String(page), limit: String(bookLimit) });
    if (search) params.set("search", search);
    const res = await fetch(`${API}/books?${params.toString()}`);
    const data = await res.json();
    setBooks(data.books || []);
    setBookTotal(data.total || 0);
  }, []);

  // ดีเลย์การค้นหา 400ms หลังพิมพ์เสร็จ กันยิง request รัวทุกตัวอักษร แล้วเด้งกลับไปหน้า 1 เสมอ
  useEffect(() => {
    const t = setTimeout(() => {
      setBookSearch(bookSearchInput);
      setBookPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [bookSearchInput]);

  useEffect(() => {
    fetchBooks(bookPage, bookSearch);
  }, [fetchBooks, bookPage, bookSearch]);

  const fetchBorrowers = useCallback(async () => {
    const res = await fetch(`${API}/borrowers`);
    setBorrowers(await res.json());
  }, []);

  const fetchBorrows = useCallback(async () => {
    const res = await fetch(`${API}/borrows`);
    setBorrows(await res.json());
  }, []);

  useEffect(() => {
    fetchBorrowers();
    fetchBorrows();
  }, [fetchBorrowers, fetchBorrows]);

  // ---- ฟังก์ชันสำหรับจัดการข้อมูลหนังสือ ----
  const handleSaveBook = async () => {
    const url = editingBook ? `${API}/books/${editingBook.id}` : `${API}/books`;
    const method = editingBook ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(bookForm) });
    if (res.ok) { notify(editingBook ? "แก้ไขหนังสือสำเร็จ" : "เพิ่มหนังสือสำเร็จ"); setBookModal(false); fetchBooks(bookPage, bookSearch); }
    else notify("เกิดข้อผิดพลาด", "error");
  };

  const handleDeleteBook = async (id: number) => {
    if (!confirm("ยืนยันการลบหนังสือ?")) return;
    await fetch(`${API}/books/${id}`, { method: "DELETE" });
    notify("ลบหนังสือสำเร็จ"); fetchBooks(bookPage, bookSearch);
  };

  const openBookModal = (book?: Book) => {
    setEditingBook(book || null);
    setBookForm(book ? { isbn: book.isbn, barcode: book.barcode, bibid: book.bibid, title: book.title, author: book.author, category: book.category, callno: book.callno, mattypeid: book.mattypeid, stock: book.stock } : emptyBook);
    setBookModal(true);
  };

  // ---- ฟังก์ชันสำหรับจัดการข้อมูลผู้ยืม ----
  const handleSaveBorrower = async () => {
    const url = editingBorrower ? `${API}/borrowers/${editingBorrower.id}` : `${API}/borrowers`;
    const method = editingBorrower ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(borrowerForm) });
    if (res.ok) { notify(editingBorrower ? "แก้ไขผู้ยืมสำเร็จ" : "เพิ่มผู้ยืมสำเร็จ"); setBorrowerModal(false); fetchBorrowers(); }
    else notify("เกิดข้อผิดพลาด", "error");
  };

  const handleDeleteBorrower = async (id: number) => {
    if (!confirm("ยืนยันการลบผู้ยืม?")) return;
    await fetch(`${API}/borrowers/${id}`, { method: "DELETE" });
    notify("ลบผู้ยืมสำเร็จ"); fetchBorrowers();
  };

  const openBorrowerModal = (b?: Borrower) => {
    setEditingBorrower(b || null);
    setBorrowerForm(b ? { code: b.code, name: b.name, type: b.type, phone: b.phone } : emptyBorrower);
    setBorrowerModal(true);
  };

  // ---- ฟังก์ชันสำหรับจัดการข้อมูลการยืม-คืน ----
  const handleCreateBorrow = async () => {
    const res = await fetch(`${API}/borrows`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ borrower_id: Number(borrowForm.borrower_id), book_id: Number(borrowForm.book_id) }) });
    if (res.ok) { notify("บันทึกการยืมสำเร็จ"); setBorrowModal(false); setBorrowForm(emptyBorrow); fetchBorrows(); }
    else notify("เกิดข้อผิดพลาด", "error");
  };

  const handleReturn = async (id: number) => {
    if (!confirm("ยืนยันการคืนหนังสือ?")) return;
    await fetch(`${API}/borrows/${id}/return`, { method: "PUT" });
    notify("บันทึกการคืนสำเร็จ"); fetchBorrows();
  };

  const handleDeleteBorrow = async (id: number) => {
    if (!confirm("ยืนยันการลบรายการ?")) return;
    await fetch(`${API}/borrows/${id}`, { method: "DELETE" });
    notify("ลบรายการสำเร็จ"); fetchBorrows();
  };

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("th-TH") : "-";
  const isOverdue = (due: string, status: string) => status === "borrowed" && new Date(due) < new Date();

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ส่วนหัวของหน้าเพจ (Header) */}
      <div className="bg-blue-900 text-white px-8 py-4 flex items-center justify-between shadow">
        <div>
          <p className="text-blue-300 text-xs">Smart Library System</p>
          <h1 className="text-xl font-bold">📋 หน้าจัดการข้อมูล (Admin)</h1>
        </div>
        {msg.text && (
          <div className={`px-4 py-2 rounded-lg text-sm font-medium ${msg.type === "error" ? "bg-red-500" : "bg-green-500"}`}>
            {msg.text}
          </div>
        )}
      </div>

      {/* ส่วนการสลับแท็บแสดงข้อมูล (Tabs) */}
      <div className="bg-white border-b flex px-8">
        {([["books", "📚 หนังสือ"], ["borrowers", "👤 ผู้ยืม"], ["borrows", "📋 รายการยืม-คืน"]] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-6 py-4 font-semibold border-b-2 transition ${tab === key ? "border-blue-700 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="p-8">

        {/* ===== ส่วนการแสดงผล: ข้อมูลหนังสือ ===== */}
        {tab === "books" && (
          <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
              <h2 className="text-lg font-bold text-gray-700">รายการหนังสือทั้งหมด ({bookTotal.toLocaleString()} เล่ม)</h2>
              <div className="flex gap-3 w-full md:w-auto">
                <input
                  value={bookSearchInput}
                  onChange={e => setBookSearchInput(e.target.value)}
                  placeholder="ค้นหาชื่อ, ผู้แต่ง หรือ Barcode..."
                  className="flex-1 md:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition"
                />
                <button onClick={() => openBookModal()} className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2 rounded-lg font-semibold transition whitespace-nowrap">
                  + เพิ่มหนังสือ
                </button>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-blue-50 text-blue-900">
                  <tr>
                    {["Barcode / ISBN", "ชื่อหนังสือ", "ผู้แต่ง", "หมวดหมู่", "จำนวน", "จัดการ"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {books.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">{bookSearch ? "ไม่พบหนังสือที่ค้นหา" : "ยังไม่มีข้อมูลหนังสือ"}</td></tr>
                  )}
                  {books.map((b, i) => (
                    <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 font-mono text-gray-500">{b.barcode}<br/><span className="text-xs text-gray-400">{b.isbn}</span></td>
                      <td className="px-4 py-3 font-medium text-gray-800">{b.title}</td>
                      <td className="px-4 py-3 text-gray-600">{b.author}</td>
                      <td className="px-4 py-3"><span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">{b.category}</span></td>
                      <td className="px-4 py-3 font-bold text-center">{b.stock}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => openBookModal(b)} className="text-blue-600 hover:underline mr-3 font-medium">แก้ไข</button>
                        <button onClick={() => handleDeleteBook(b.id)} className="text-red-500 hover:underline font-medium">ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* แถบเปลี่ยนหน้า */}
            {bookTotalPages > 1 && (
              <div className="flex justify-center items-center gap-3 mt-4">
                <button
                  onClick={() => setBookPage(p => Math.max(1, p - 1))}
                  disabled={bookPage <= 1}
                  className="px-4 py-2 rounded-lg bg-white shadow text-sm font-semibold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                >
                  ← ก่อนหน้า
                </button>
                <span className="text-sm text-gray-500">หน้า {bookPage} จาก {bookTotalPages}</span>
                <button
                  onClick={() => setBookPage(p => Math.min(bookTotalPages, p + 1))}
                  disabled={bookPage >= bookTotalPages}
                  className="px-4 py-2 rounded-lg bg-white shadow text-sm font-semibold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                >
                  ถัดไป →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== ส่วนการแสดงผล: ข้อมูลผู้ยืม ===== */}
        {tab === "borrowers" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-700">ผู้ยืมทั้งหมด ({borrowers.length} คน)</h2>
              <button onClick={() => openBorrowerModal()} className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2 rounded-lg font-semibold transition">
                + เพิ่มผู้ยืม
              </button>
            </div>
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-blue-50 text-blue-900">
                  <tr>
                    {["รหัส", "ชื่อ-นามสกุล", "ประเภท", "เบอร์โทร", "จัดการ"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {borrowers.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">ยังไม่มีข้อมูลผู้ยืม</td></tr>
                  )}
                  {borrowers.map((b, i) => (
                    <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 font-mono text-gray-500">{b.code}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{b.name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${b.type === "student" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                          {b.type === "student" ? "นักศึกษา" : "บุคคลภายนอก"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{b.phone || "-"}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => openBorrowerModal(b)} className="text-blue-600 hover:underline mr-3 font-medium">แก้ไข</button>
                        <button onClick={() => handleDeleteBorrower(b.id)} className="text-red-500 hover:underline font-medium">ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== ส่วนการแสดงผล: รายการยืม-คืน ===== */}
        {tab === "borrows" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-700">รายการยืม-คืนทั้งหมด ({borrows.length} รายการ)</h2>
              <button onClick={() => setBorrowModal(true)} className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2 rounded-lg font-semibold transition">
                + บันทึกการยืม
              </button>
            </div>
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-blue-50 text-blue-900">
                  <tr>
                    {["รหัสผู้ยืม", "หนังสือ", "วันที่ยืม", "กำหนดคืน", "วันที่คืน", "เบอร์โทรผู้คืน", "สถานะ", "จัดการ"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {borrows.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-gray-400">ยังไม่มีรายการยืม-คืน</td></tr>
                  )}
                  {borrows.map((r, i) => (
                    <tr key={r.id} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} ${isOverdue(r.due_date, r.status) ? "border-l-4 border-red-400" : ""}`}>
                      <td className="px-4 py-3 font-medium text-gray-800 font-mono">{r.borrower_code || "-"}</td>
                      <td className="px-4 py-3 text-gray-700">{r.book_title || "-"}<br /><span className="text-gray-400 text-xs font-mono">{r.book_barcode}</span></td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(r.borrowed_at)}</td>
                      <td className={`px-4 py-3 font-medium ${isOverdue(r.due_date, r.status) ? "text-red-600" : "text-gray-700"}`}>
                        {fmtDate(r.due_date)}{isOverdue(r.due_date, r.status) && " ⚠️"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.returned_at ? fmtDate(r.returned_at) : "-"}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono">{r.returned_by_phone || "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${(r.status === "returned" || r.status === "archived") ? "bg-green-100 text-green-700" : isOverdue(r.due_date, r.status) ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {(r.status === "returned" || r.status === "archived") ? "คืนแล้ว" : isOverdue(r.due_date, r.status) ? "เกินกำหนด" : "กำลังยืม"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.status === "borrowed" && (
                          <button onClick={() => handleReturn(r.id)} className="text-green-600 hover:underline mr-3 font-medium">บันทึกคืน</button>
                        )}
                        <button onClick={() => handleDeleteBorrow(r.id)} className="text-red-500 hover:underline font-medium">ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ===== หน้าต่างสำหรับจัดการข้อมูลหนังสือ (Modal) ===== */}
      {bookModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h3 className="text-xl font-bold text-blue-900 mb-6">{editingBook ? "✏️ แก้ไขหนังสือ" : "➕ เพิ่มหนังสือ"}</h3>
            {[
              { label: "Barcode", key: "barcode", placeholder: "Barcode หนังสือ" },
              { label: "BibID", key: "bibid", placeholder: "BibID ของห้องสมุด" },
              { label: "ISBN", key: "isbn", placeholder: "978-XXXXXXXXXX" },
              { label: "ชื่อหนังสือ", key: "title", placeholder: "ชื่อหนังสือ" },
              { label: "ผู้แต่ง", key: "author", placeholder: "ชื่อผู้แต่ง" },
              { label: "เลขเรียก (Call No)", key: "callno", placeholder: "020ป1711ส" },
              { label: "หมวดหมู่", key: "category", placeholder: "เช่น วิทยาศาสตร์, นิยาย" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input value={(bookForm as any)[key]} onChange={e => setBookForm({ ...bookForm, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 transition" />
              </div>
            ))}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">จำนวน</label>
              <input type="number" min={1} value={bookForm.stock} onChange={e => setBookForm({ ...bookForm, stock: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 transition" />
            </div>
            <div className="flex gap-3">
              <button onClick={handleSaveBook} className="flex-1 bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-xl transition">บันทึก</button>
              <button onClick={() => setBookModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== หน้าต่างสำหรับจัดการข้อมูลผู้ยืม (Modal) ===== */}
      {borrowerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h3 className="text-xl font-bold text-blue-900 mb-6">{editingBorrower ? "✏️ แก้ไขผู้ยืม" : "➕ เพิ่มผู้ยืม"}</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">ประเภท</label>
              <select value={borrowerForm.type} onChange={e => setBorrowerForm({ ...borrowerForm, type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                <option value="student">นักศึกษา / บุคลากร</option>
                <option value="external">บุคคลภายนอก</option>
              </select>
            </div>
            {[
              { label: borrowerForm.type === "student" ? "รหัสนักศึกษา" : "เบอร์โทรศัพท์ (รหัส)", key: "code", placeholder: "รหัสประจำตัว" },
              { label: "ชื่อ-นามสกุล", key: "name", placeholder: "ชื่อ นามสกุล" },
              { label: "เบอร์โทรศัพท์", key: "phone", placeholder: "0812345678" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input value={(borrowerForm as any)[key]} onChange={e => setBorrowerForm({ ...borrowerForm, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 transition" />
              </div>
            ))}
            <div className="flex gap-3 mt-2">
              <button onClick={handleSaveBorrower} className="flex-1 bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-xl transition">บันทึก</button>
              <button onClick={() => setBorrowerModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== หน้าต่างสำหรับจัดการรายการยืมหนังสือ (Modal) ===== */}
      {borrowModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <h3 className="text-xl font-bold text-blue-900 mb-6">➕ บันทึกการยืมหนังสือ</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">ผู้ยืม</label>
              <select value={borrowForm.borrower_id} onChange={e => setBorrowForm({ ...borrowForm, borrower_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                <option value="">-- เลือกผู้ยืม --</option>
                {borrowers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">หนังสือ</label>
              <select value={borrowForm.book_id} onChange={e => setBorrowForm({ ...borrowForm, book_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                <option value="">-- เลือกหนังสือ --</option>
                {books.map(b => <option key={b.id} value={b.id}>{b.title} (คงเหลือ: {b.stock})</option>)}
              </select>
            </div>
            <p className="text-gray-400 text-xs mb-4">📅 กำหนดคืนภายใน 14 วันนับจากวันที่ยืม</p>
            <div className="flex gap-3">
              <button onClick={handleCreateBorrow} className="flex-1 bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-xl transition">บันทึก</button>
              <button onClick={() => setBorrowModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}