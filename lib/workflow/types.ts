export type InvoiceStatus =
  | 'incoming'
  | 'categorized'
  | 'awaiting_office_approval'
  | 'awaiting_admin_approval'
  | 'to_be_paid'
  | 'paid'
  | 'rejected'
  | 'repair'
  | 'removed';

export interface Actor {
  email: string;
  name: string;
}

export interface ApprovalEntry {
  by: string;
  at: string; // ISO timestamp
  notes?: string;
}

export interface InvoiceApprovals {
  ap?: ApprovalEntry;
  office?: Record<string, ApprovalEntry>; // keyed by office name
  admin?: ApprovalEntry;
  paid?: ApprovalEntry;
  rejected?: ApprovalEntry;
  repair?: ApprovalEntry;
}
