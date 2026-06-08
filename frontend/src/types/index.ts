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
  title: string; 
  author: string;
};

export type BorrowRecord = { 
  id: number; 
  book: Book; 
  due_date: string;
};
