// Company types based on the backend serializer
export interface Company {
  id: number;
  name: string;
  status: "main" | "partner" | "basic";
  email: string;
  representative: number | null;
  representative_name: string | null;
  representative_surname: string | null;
  representative_phone_number: string | null;
  representative_username: string | null;
  fr_resp: number | null;
  fr_resp_name: string | null;
  fr_resp_surname: string | null;
  fr_resp_email: string | null;
  fr_resp_phone_number: string | null;
  fr_resp_username: string | null;
  day1_stand: { stand_number: string; stand_size: string } | null;
  day2_stand: { stand_number: string; stand_size: string } | null;
  completed_stages_count: number;
  created_at: string;
  updated_at: string;
}

// Staff user type
export interface StaffUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  type: "admin" | "staff";
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
  first_name?: string;
  last_name?: string;
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
  language: "en" | "pl";
  invitation_status: "accepted" | "expired" | "not accepted" | "cancelled";
  invitation_link: string;
  fr_resp: number | null;
  fr_resp_name: string | null;
  fr_resp_surname: string | null;
  fr_resp_email: string | null;
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
export type FeedbackStatus = "pending" | "accepted" | "rejected";

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
  completion_timestamps?: Record<string, string | null>; // ISO date strings or null - timestamps when stages were completed
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
  deadline?: string | null; // ISO date string or null
  daysRemaining?: number | null; // Days remaining until deadline, or null if no deadline
  completedAt?: string | null; // ISO date string or null - timestamp when stage was completed
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

export interface Stage1Data {
  basic_data: BasicData;
  address: Address | null;
  terms_accepted?: boolean;
}

// === Stage 2: Stand Details ===
export interface StandDetails {
  id?: number;
  company: number;
  stand_type: "provided_stand" | "self_construction";
  sc_details?: string;
  name_sign_text?: string;
  logo_sign_file?: string;
  fire_cert?: string;
  dl?: number | null;
}

export interface EquipmentItem {
  id: number;
  name: string;
  price: string; // Decimal as string from API
  is_basic: boolean;
  included_quantity: number; // How many are included for free
  category?: string;
  is_active: boolean;
}

export interface EquipmentSelection {
  id?: number;
  equipment_item: EquipmentItem;
  equipment_item_id?: number;
  quantity: number;
}

export interface Stage2Data {
  stand_details: StandDetails;
  equipment_selections: EquipmentSelection[];
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

export interface Stage4Data {
  jobwalls: Jobwall[];
  description: Description | null;
}

// === Stage 5: Final Data ===
export interface Description {
  id?: number;
  company: number;
  descr: string;
  logo_file?: string;
  dl?: number | null;
}

export interface FinalData {
  id?: number;
  company: number;
  el_devices: string;
  el_power: string;
  el_low_power?: boolean;
  lunches_declined?: boolean;
  no_other_delegates?: boolean;
  main_rep_name?: string;
  main_rep_surname?: string;
  main_rep_phone?: string;
  main_rep_attendance?: AttendanceOption | "";
  dl?: number | null;
}

export type DayOption = "day1" | "day2";

export type DietOption = "meat" | "vegetarian" | "vegan";

export type AttendanceOption = "both" | "day1" | "day2" | "none";

export interface Lunch {
  id?: number;
  day: DayOption;
  lunch_quantity: number;
  diet_info: DietOption;
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
  attendance: AttendanceOption | "";
}

export interface Stage5Data {
  final_data: FinalData;
  lunches: Lunch[];
  pdi: PDI | null;
  pdi_attendees: PDIAttendee[];
  exhibitors: Exhibitor[];
}
