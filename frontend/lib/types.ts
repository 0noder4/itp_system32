// Company types based on the backend serializer
export interface Company {
  id: number;
  name: string;
  status: "main" | "partner" | "basic";
  email: string;
  representative: number | null;
  representative_name: string | null;
  representative_surname: string | null;
  created_at: string;
  updated_at: string;
}

// Company info included in user validation response
export interface CompanyInfo {
  id: number;
  name: string;
  status: "main" | "partner" | "basic";
  email: string;
}

// User validation response
export interface UserValidationResponse {
  id: number;
  username: string;
  email: string;
  user_type: "admin" | "staff" | "company";
  language: "en" | "pl";
  is_active: boolean;
  company?: CompanyInfo;
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

// Form model - tracks stage completion
export interface Form {
  id: number;
  current_stage: string;
  stage_1_completed: boolean;
  stage_2_completed: boolean;
  stage_3_completed: boolean;
  stage_4_completed: boolean;
  stage_5_completed: boolean;
}

// Feedback status options
export type FeedbackStatus = "pending" | "akcept" | "odrzucenie";

// Feedback interface
export interface Feedback {
  id: number;
  company: number;
  form: string;
  status: FeedbackStatus;
  comment: string;
}

// Stage feedback summary (used in form status response)
export interface StageFeedback {
  status: FeedbackStatus;
  comment: string;
}

// Form status response from API
export interface FormStatusResponse {
  form: Form;
  feedbacks: Record<string, StageFeedback>;
  data_exists: Record<string, boolean>;
}

// Stage status for UI display
export type StageStatus =
  | "not_started"
  | "in_progress"
  | "pending_approval"
  | "accepted"
  | "rejected";

// Stage info for overview display
export interface StageInfo {
  stageNumber: number;
  title: string;
  description: string;
  status: StageStatus;
  isCompleted: boolean;
  feedback?: StageFeedback;
  dataExists: boolean;
}

// === Stage 1: Basic Data ===
export interface BasicData {
  id?: number;
  company: number;
  full_name: string;
  nip: string;
  dl?: number | null;
}

export interface Address {
  id?: number;
  street: string;
  home_number: string;
  apt_number?: string;
  city: string;
  country: string;
  postal_code: string;
}

export interface ContactPerson {
  id?: number;
  name: string;
  surname: string;
  phone_number: string;
  email: string;
}

export interface Stage1Data {
  basic_data: BasicData;
  address: Address | null;
  contact_person: ContactPerson | null;
}

// === Stage 2: Stand Details ===
export interface StandDetails {
  id?: number;
  company: number;
  self_construction: boolean;
  sc_details?: string;
  name_sign_text?: string;
  logo_sign_file?: string;
  dl?: number | null;
}

export interface BasicEquipment {
  id?: number;
  form?: number;
  chair: number;
  counter: boolean;
  trashbin: boolean;
  hanger: boolean;
}

export interface ExtendedEquipment {
  id?: number;
  form?: number;
  counter: number;
  arched_counter: number;
  tv: number;
  chair: number;
  bar_table: number;
  bar_stool: number;
  leaflet_stand: number;
  carpet_color: string;
}

export interface Stage2Data {
  stand_details: StandDetails;
  basic_equipment: BasicEquipment | null;
  extended_equipment: ExtendedEquipment | null;
}

// === Stage 3: Workshop ===
export interface Workshop {
  id?: number;
  company: number;
  workshop: boolean;
  notes?: string;
  dl?: number | null;
}

export type Stage3Data = Workshop;

// === Stage 4: Jobwall ===
export type WorkForm = "s" | "z" | "h" | "k" | "m";
export type Workload = "pelen" | "pol" | "trzyczwarte" | "el";
export type ContractType = "uop" | "uoz" | "uod" | "b2b" | "uos";

export interface Jobwall {
  id?: number;
  company: number;
  name: string;
  form: WorkForm;
  workload: Workload;
  contract: ContractType;
  description: string;
  benefits: string;
  requirements: string;
  url: string;
  dl?: number | null;
}

export type Stage4Data = Jobwall;

// === Stage 5: Final Data ===
export interface Description {
  id?: number;
  company: number;
  descr: string;
  dl?: number | null;
}

export interface FinalData {
  id?: number;
  company: number;
  fire_cert?: string;
  gg_parking: boolean;
  el_devices: string;
  el_power: string;
  dl?: number | null;
}

export type DayOption = "day1" | "day2";

export interface Lunch {
  id?: number;
  day: DayOption;
  lunch_quantity: number;
  diet_info: string;
}

export interface PDI {
  id?: number;
  tickets_quantity: number;
}

export interface PDIAttendee {
  id?: number;
  name: string;
  surname: string;
  phone_number: string;
  email: string;
}

export interface Exhibitor {
  id?: number;
  name: string;
  surname: string;
  phone_number: string;
}

export interface Stage5Data {
  description: Description;
  final_data: FinalData;
  lunches: Lunch[];
  pdi: PDI | null;
  pdi_attendees: PDIAttendee[];
  exhibitors: Exhibitor[];
}
