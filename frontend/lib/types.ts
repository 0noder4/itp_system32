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

