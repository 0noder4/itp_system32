// Company types based on the backend serializer
export interface Company {
  id: number;
  name: string;
  status: "main" | "partner" | "basic";
  email: string;
  representative: number | null;
  created_at: string;
  updated_at: string;
}

// Company invitation types based on the backend serializer
export interface CompanyInvitation {
  id: number;
  email: string;
  company_name: string;
  company_status: "main" | "partner" | "basic";
  created_at: string;
  updated_at: string;
  expires_at: string;
  is_accepted: boolean;
}
