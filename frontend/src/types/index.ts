export type Step = "select-user" | "identify" | "check-book" | "drop" | "success";

export type Borrower = { 
  id: number; 
  code: string; 
  name: string; 
  type: string; 
  phone?: string;
};

export type Book = { 
  id: number; 
  isbn: string; 
  barcode: string;
  bibid: string;
  callno: string;
  title: string; 
  author: string;
};

export type BorrowRecord = { 
  id: number; 
  book: Book; 
  due_date: string;
};

export type PatronBorrow = {
  NO: number;
  BARCODE: string;
  BIBID: string;
  TITLE: string;
  MATTYPEID: number;
  AUTHOR: string;
  CALLNO: string;
  RENEW: number;
  CHECKOUTDATE: string;
  DUEDATE: string;
};

export type BibInfoItem = {
  FIELD: string;
  DATA: string;
};
