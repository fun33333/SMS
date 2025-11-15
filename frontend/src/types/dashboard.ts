// Legacy Student interface - keeping for backward compatibility
export interface LegacyStudent {
  current_grade: string
  rawData: any
  studentId: string
  name: string
  academicYear: number
  campus: string
  grade: string
  gender: "Male" | "Female" | "Other"
  motherTongue: string
  religion: string
  attendancePercentage: number
  averageScore: number
  retentionFlag: boolean
  enrollmentDate: Date
}
  
  export interface FilterState {
    academicYears: number[]
    campuses: string[]
    grades: string[]
    genders: ("Male" | "Female" | "Other")[]
    motherTongues: string[]
    religions: string[]
  }
  
  export interface DashboardMetrics {
    totalStudents: number
    averageAttendance: number
    averageScore: number
    retentionRate: number
  }
  
  export interface ChartData {
    name: string
    value: number
    fill?: string
  }
  
  export interface TrendData {
    year: number
    enrollment: number
    retention: number
  }

export type CampusStatus = "active" | "inactive" | "temporary_closed";

// Shift Types
export type Shift = 'morning' | 'afternoon' | 'both';

export type ShiftOption = {
  value: Shift;
  label: string;
};

export type CampusCreateRequest = {
  name: string;
  code: string | null;
  status: CampusStatus;
  governing_body: string | null;
  registration_no: string | null;
  address: string;
  grades_offered: string;
  languages_of_instruction: string;
  academic_year_start_month: number;
  academic_year_end_month?: number | null;
  capacity: number;
  avg_class_size: number;
  num_students: number;
  num_students_male: number;
  num_students_female: number;
  num_teachers: number;
  num_teachers_male: number;
  num_teachers_female: number;
  num_rooms: number;
  total_classrooms: number;
  office_rooms: number;
  biology_labs: number;
  chemistry_labs: number;
  physics_labs: number;
  computer_labs: number;
  library: boolean;
  toilets_male: number;
  toilets_female: number;
  toilets_teachers: number;
  facilities: string | null;
  power_backup: boolean;
  internet_wifi: boolean;
  established_date: string | null; // YYYY-MM-DD
  campus_address: string | null;
  special_classes: string | null;
  total_teachers: number;
  total_non_teaching_staff: number;
  // teacher_student_ratio removed
  staff_contact_hr: string | null;
  admission_office_contact: string | null;
  photo?: string | null;
  is_draft: boolean;
};

// Student Types
export type Student = {
  id: number;
  name: string;
  gender?: string;
  dob?: string;
  place_of_birth?: string;
  religion?: string;
  mother_tongue?: string;
  emergency_contact?: string;
  address?: string;
  family_income?: number;
  house_owned: boolean;
  rent_amount?: number;
  zakat_status?: string;
  campus?: {
    id: number;
    name: string;
  } | null;
  current_grade?: string;
  section?: string;
  last_class_passed?: string;
  last_school_name?: string;
  gr_no?: string;
  father_name?: string;
  father_contact?: string;
  father_cnic?: string;
  father_occupation?: string;
  mother_name?: string;
  mother_contact?: string;
  mother_cnic?: string;
  mother_status?: string;
  mother_occupation?: string;
  guardian_name?: string;
  guardian_cnic?: string;
  guardian_occupation?: string;
  photo?: string;
  current_state: string;
  is_draft: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StudentCreateRequest = {
  // Personal Information
  name: string;
  gender: string;
  date_of_birth: string;
  place_of_birth: string;
  religion: string;
  mother_tongue: string;
  
  // Contact Information
  emergency_contact: string;
  address: string;
  family_income: string;
  house_owned: boolean;
  monthly_rent?: string | null;
  zakat_status: string;
  
  // Academic Information
  campus: string;
  current_grade: string;
  section: string;
  shift: string;
  admission_year: string;
  last_class_passed: string;
  last_school_name: string;
  last_class_result: string;
  gr_number?: string;
  
  // Family Information
  father_name?: string;
  father_contact?: string;
  father_cnic?: string;
  father_status?: string;
  father_occupation?: string;
  mother_name?: string;
  mother_contact?: string;
  mother_cnic?: string;
  mother_status?: string;
  mother_occupation?: string;
  guardian_name?: string;
  guardian_relation?: string;
  guardian_phone?: string;
  guardian_cnic?: string;
  guardian_occupation?: string;
  siblings_in_alkhair?: string;
  siblings_names?: string;
  
  // Photo
  photo?: string | null;
};
  