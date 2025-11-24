'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Search, User, GraduationCap, FileText, CheckCircle, XCircle, ArrowRightLeft, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  createTransferRequest,
  previewIDChange,
  getAllCampuses,
  getAllStudents,
  getAllTeachers,
  createClassTransfer,
  createShiftTransfer,
  getAvailableClassSections,
  getAvailableShiftSections,
  AvailableClassroomOption,
  getAvailableGradesForSkip,
  getAvailableSectionsForGradeSkip,
  createGradeSkipTransfer,
  AvailableGradeForSkip,
} from '@/lib/api';
import { getCurrentUserRole } from '@/lib/permissions';

interface Campus {
  id: number;
  campus_name: string;
  code?: string;
  campus_code?: string;
}

interface Student {
  id: number;
  name: string;
  student_id: string;
  current_campus: number;
  shift: 'M' | 'A';
  // Optional extra fields for richer UI (if backend provides them)
  current_grade?: string;
  section?: string;
  campus_name?: string;
  class_teacher_name?: string;
  coordinator_name?: string;
}

interface Teacher {
  id: number;
  full_name: string;
  employee_code: string;
  current_campus: number;
  shift: 'M' | 'A';
  role: string;
}

interface IDPreview {
  old_id: string;
  new_id: string;
  changes: {
    campus_code: string;
    shift: string;
    year: string;
    role?: string;
    suffix: string;
  };
}

export default function CreateTransferRequestPage() {
  const router = useRouter();
  const userRole = getCurrentUserRole();
  const isPrincipal = userRole === 'principal';
  const isTeacher = userRole === 'teacher';
  const isCoordinator = userRole === 'coordinator';
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    request_type: 'student' as 'student' | 'teacher', 
    transfer_type: (isPrincipal ? 'campus' : 'class') as 'campus' | 'shift' | 'class' | 'grade_skipping',
    from_campus: '',
    from_shift: 'M' as 'M' | 'A' | 'B',
    to_campus: '',
    to_shift: 'M' as 'M' | 'A' | 'B',
    entity_id: '',
    reason: '',
    notes: ''
  });
  
  // Data lists
  const [campuses, setCampuses] = useState<Campus[]>([]);

  const [searchResults, setSearchResults] = useState<(Student | Teacher)[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<Student | Teacher | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // ID Preview
  const [idPreview, setIdPreview] = useState<IDPreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Destination classroom options (for class/shift transfers initiated by teachers/coordinators)
  const [availableClassSections, setAvailableClassSections] = useState<AvailableClassroomOption[]>([]);
  const [availableShiftSections, setAvailableShiftSections] = useState<AvailableClassroomOption[]>([]);
  const [selectedToClassroomId, setSelectedToClassroomId] = useState<string>('');
  
  // Grade skip specific state
  const [availableGradeForSkip, setAvailableGradeForSkip] = useState<AvailableGradeForSkip | null>(null);
  const [availableGradeSkipSections, setAvailableGradeSkipSections] = useState<AvailableClassroomOption[]>([]);
  const [selectedToGradeId, setSelectedToGradeId] = useState<string>('');
  const [selectedToGradeSkipClassroomId, setSelectedToGradeSkipClassroomId] = useState<string>('');
  const [gradeSkipLoading, setGradeSkipLoading] = useState(false);

  // Transfer letter state
  const [showLetter, setShowLetter] = useState(false);
  const [letterData, setLetterData] = useState<any>(null);
  
  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);
  
  // Load preview when form changes (for principal-initiated transfers)
  useEffect(() => {
    if (isPrincipal && selectedEntity && formData.to_campus && formData.to_shift) {
      loadIDPreview();
    }
  }, [isPrincipal, selectedEntity, formData.to_campus, formData.to_shift]);

  // Load preview for shift transfers when campus is set
  useEffect(() => {
    if (!isPrincipal && selectedEntity && formData.transfer_type === 'shift' && formData.to_campus && formData.to_shift) {
      const timer = setTimeout(() => {
        loadIDPreview();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isPrincipal, selectedEntity, formData.transfer_type, formData.to_campus, formData.to_shift]);

  // Load ID preview for shift transfers (non-principal, same campus)
  useEffect(() => {
    if (!isPrincipal && selectedEntity && formData.transfer_type === 'shift' && formData.to_shift) {
      // For shift transfers, use the same campus as the student's current campus
      const anyEntity = selectedEntity as any;
      const campusId = anyEntity.current_campus || anyEntity.campus || anyEntity.current_campus_id || anyEntity.campus_id;
      
      if (campusId) {
        // Set the campus in formData for preview
        const campusIdStr = campusId.toString();
        setFormData(prev => {
          if (prev.to_campus !== campusIdStr) {
            return { ...prev, to_campus: campusIdStr };
          }
          return prev;
        });
        
        // Load preview after a short delay to ensure formData is updated
        const timer = setTimeout(() => {
          // Force reload by calling loadIDPreview directly with the campus
          if (selectedEntity) {
            loadIDPreview();
          }
        }, 300);
        
        return () => clearTimeout(timer);
      }
    }
  }, [isPrincipal, selectedEntity, formData.transfer_type, formData.to_shift]);

  // Load ID preview for grade skip transfers when shift changes
  useEffect(() => {
    if (!isPrincipal && selectedEntity && formData.transfer_type === 'grade_skipping' && formData.to_shift && formData.to_shift !== 'B') {
      // For grade skip transfers, use the same campus as the student's current campus
      const anyEntity = selectedEntity as any;
      const campusId = anyEntity.current_campus || anyEntity.campus || anyEntity.current_campus_id || anyEntity.campus_id;
      
      if (campusId) {
        // Set the campus in formData for preview
        const campusIdStr = campusId.toString();
        setFormData(prev => {
          if (prev.to_campus !== campusIdStr) {
            return { ...prev, to_campus: campusIdStr };
          }
          return prev;
        });
        
        // Load preview after a short delay to ensure formData is updated
        const timer = setTimeout(() => {
          if (selectedEntity) {
            loadIDPreview();
          }
        }, 300);
        
        return () => clearTimeout(timer);
      }
    }
  }, [isPrincipal, selectedEntity, formData.transfer_type, formData.to_shift]);

  // Auto-set opposite shift when shift transfer is selected and entity is chosen
  useEffect(() => {
    if (!isPrincipal && selectedEntity && formData.transfer_type === 'shift') {
      const currentShift = selectedEntity.shift;
      // Normalize shift value (handle both 'M'/'A' and 'morning'/'afternoon')
      const shiftStr = String(currentShift).toLowerCase();
      const normalizedShift = 
        currentShift === 'M' || shiftStr === 'morning' ? 'M' :
        currentShift === 'A' || shiftStr === 'afternoon' ? 'A' :
        null;
      
      // Determine opposite shift
      const oppositeShift = normalizedShift === 'M' ? 'A' : normalizedShift === 'A' ? 'M' : null;
      
      // Always set to opposite shift if it's different
      if (oppositeShift && formData.to_shift !== oppositeShift) {
        setFormData(prev => ({ ...prev, to_shift: oppositeShift }));
      }
    }
  }, [isPrincipal, selectedEntity, formData.transfer_type]);

  // Reload ID preview when destination classroom is selected for shift transfers
  useEffect(() => {
    if (!isPrincipal && selectedEntity && formData.transfer_type === 'shift' && formData.to_shift && selectedToClassroomId) {
      // Small delay to ensure state is updated
      const timer = setTimeout(() => {
        loadIDPreview();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isPrincipal, selectedEntity, formData.transfer_type, formData.to_shift, selectedToClassroomId]);

  // Load available class sections for class transfer (same campus, same shift)
  useEffect(() => {
    const load = async () => {
      if (!selectedEntity || formData.transfer_type !== 'class') return;
      try {
        const options = await getAvailableClassSections(selectedEntity.id);
        setAvailableClassSections(options || []);
      } catch (error) {
        toast.error('Failed to load available class sections');
      }
    };
    if (!isPrincipal && selectedEntity && formData.transfer_type === 'class') {
      load();
    }
  }, [isPrincipal, selectedEntity, formData.transfer_type]);

  // Load available shift sections for shift transfer
  useEffect(() => {
    const load = async () => {
      if (!selectedEntity || formData.transfer_type !== 'shift' || !formData.to_shift) {
        setAvailableShiftSections([]);
        return;
      }
      try {
        // Map internal shift code (M/A/B) to API shift values
        const toShift =
          formData.to_shift === 'M'
            ? 'morning'
            : formData.to_shift === 'A'
            ? 'afternoon'
            : 'morning';
        
        const options = await getAvailableShiftSections(selectedEntity.id, toShift as 'morning' | 'afternoon');
        
        // Client-side filter: Only show sections with the correct shift (or 'both')
        // This is a safety measure in case backend filtering has issues
        const normalizedToShift = toShift.toLowerCase();
        const filteredOptions = (options || []).filter(opt => {
          const optShift = String(opt.shift || '').toLowerCase();
          // Include if shift matches exactly, or if option has 'both' shift
          return optShift === normalizedToShift || optShift === 'both';
        });
        
        setAvailableShiftSections(filteredOptions);
      } catch (error) {
        toast.error('Failed to load available shift sections');
        setAvailableShiftSections([]);
      }
    };
    if (!isPrincipal && selectedEntity && formData.transfer_type === 'shift' && formData.to_shift) {
      load();
    } else {
      setAvailableShiftSections([]);
    }
  }, [isPrincipal, selectedEntity, formData.transfer_type, formData.to_shift]);

  // Load available grade for skip
  useEffect(() => {
    const load = async () => {
      if (!selectedEntity || formData.transfer_type !== 'grade_skipping' || !('student_id' in selectedEntity)) {
        setAvailableGradeForSkip(null);
        setSelectedToGradeId('');
        return;
      }
      try {
        setGradeSkipLoading(true);
        
        // Initialize to_shift with current shift if not set
        if (!formData.to_shift || formData.to_shift === 'B') {
          const currentShift = selectedEntity.shift;
          const shiftStr = String(currentShift).toLowerCase();
          const normalizedShift = 
            currentShift === 'M' || shiftStr === 'morning' ? 'M' :
            currentShift === 'A' || shiftStr === 'afternoon' ? 'A' :
            'M';
          setFormData(prev => ({ ...prev, to_shift: normalizedShift }));
        }
        
        const gradeData = await getAvailableGradesForSkip(selectedEntity.id);
        setAvailableGradeForSkip(gradeData);
        setSelectedToGradeId(gradeData.id.toString());
      } catch (error) {
        toast.error('Failed to load available grade for skip');
        setAvailableGradeForSkip(null);
      } finally {
        setGradeSkipLoading(false);
      }
    };
    if (!isPrincipal && selectedEntity && formData.transfer_type === 'grade_skipping') {
      load();
    }
  }, [isPrincipal, selectedEntity, formData.transfer_type]);

  // Load available sections for grade skip
  useEffect(() => {
    const load = async () => {
      if (!selectedEntity || formData.transfer_type !== 'grade_skipping' || !selectedToGradeId) {
        setAvailableGradeSkipSections([]);
        return;
      }
      try {
        // Normalize shift value - handle both 'M'/'A' and current shift
        let toShift: 'morning' | 'afternoon' | undefined = undefined;
        if (formData.to_shift) {
          if (formData.to_shift === 'M') {
            toShift = 'morning';
          } else if (formData.to_shift === 'A') {
            toShift = 'afternoon';
          } else if (formData.to_shift === 'B') {
            // 'B' means both, so don't filter by shift
            toShift = undefined;
          }
        }
        
        const options = await getAvailableSectionsForGradeSkip(
          selectedEntity.id,
          parseInt(selectedToGradeId, 10),
          toShift
        );
        setAvailableGradeSkipSections(options || []);
      } catch (error) {
        console.error('Error loading sections for grade skip:', error);
        toast.error('Failed to load available sections for grade skip');
        setAvailableGradeSkipSections([]);
      }
    };
    if (!isPrincipal && selectedEntity && formData.transfer_type === 'grade_skipping' && selectedToGradeId) {
      load();
    }
  }, [isPrincipal, selectedEntity, formData.transfer_type, selectedToGradeId, formData.to_shift]);

  // Debug form data changes
  useEffect(() => {
  }, [formData]);

  // Selected destination classroom option (for summary UI)
  const selectedDestinationOption: AvailableClassroomOption | undefined =
    !isPrincipal && selectedToClassroomId
      ? (formData.transfer_type === 'class'
          ? availableClassSections.find(opt => opt.id.toString() === selectedToClassroomId)
          : availableShiftSections.find(opt => opt.id.toString() === selectedToClassroomId))
      : undefined;
  
  const loadInitialData = async () => {
    try {
      setLoading(true);
      
      if (isPrincipal) {
        // Principals can choose destination campus; load from API
        const campusesData = await getAllCampuses();

        if (Array.isArray(campusesData) && campusesData.length > 0) {
          setCampuses(campusesData);
        } else {
          toast.info('No campuses found in database');
        }
      }
    } catch (error) {
      toast.error('Failed to load campus data, using sample data');
      
      // Fallback to sample data
      setCampuses([
        { id: 1, campus_name: 'Main Campus Karachi', code: 'MC001' },
        { id: 2, campus_name: 'Branch Campus Lahore', code: 'BC002' },
        { id: 3, campus_name: 'North Campus Islamabad', code: 'NC003' },
        { id: 4, campus_name: 'South Campus Multan', code: 'SC004' },
        { id: 5, campus_name: 'East Campus Faisalabad', code: 'EC005' }
      ]);
    } finally {
      setLoading(false);
    }
  };
  
  const searchEntity = async () => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      toast.error('Please enter at least 2 characters to search');
      return;
    }
    
    try {
      setSearching(true);
      
      if (formData.request_type === 'student') {
        const studentsData = await getAllStudents();
        // Filter by search query
        const filtered = studentsData.filter((student: Student) => 
          student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          student.student_id.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setSearchResults(filtered);
        if (filtered.length === 0) {
          toast.info('No students found matching your search');
        }
      } else {
        const teachersData = await getAllTeachers();
        // Filter by search query
        const filtered = teachersData.filter((teacher: Teacher) => 
          teacher.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          teacher.employee_code.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setSearchResults(filtered);
        if (filtered.length === 0) {
          toast.info('No teachers found matching your search');
        }
      }
    } catch (error) {
      toast.error('Failed to search entities');
    } finally {
      setSearching(false);
    }
  };
  
  const selectEntity = (entity: Student | Teacher) => {
    setSelectedEntity(entity);
    setFormData(prev => ({ ...prev, entity_id: entity.id.toString() }));
    setSearchResults([]);
    setSearchQuery('');
    toast.success(`${'name' in entity ? 'Student' : 'Teacher'} selected successfully`);
  };
  
  const loadIDPreview = async () => {
    if (!selectedEntity) return;
    
    try {
      setPreviewLoading(true);
      const oldId = 'student_id' in selectedEntity ? selectedEntity.student_id : selectedEntity.employee_code;
      
      if (!oldId) {
        setPreviewLoading(false);
        return;
      }
      
      // For shift transfers and grade skip transfers (non-principal), use the student's current campus
      let campusIdToUse = formData.to_campus;
      if (!isPrincipal && (formData.transfer_type === 'shift' || formData.transfer_type === 'grade_skipping') && !campusIdToUse) {
        const anyEntity = selectedEntity as any;
        campusIdToUse = (anyEntity.current_campus || anyEntity.campus || anyEntity.current_campus_id || anyEntity.campus_id)?.toString();
      }
      
      if (!campusIdToUse) {
        setPreviewLoading(false);
        return;
      }
      
      let toCampus = campuses.find(c => c.id.toString() === campusIdToUse);
      
      // If campus not found in campuses array, try to get campus code from entity
      if (!toCampus) {
        const anyEntity = selectedEntity as any;
        // Try to extract campus code from the student ID (e.g., C06 from C06-M-25-01109)
        const idParts = oldId.split('-');
        if (idParts.length > 0) {
          const campusCodeFromId = idParts[0];
          // Create a temporary campus object
          toCampus = {
            id: parseInt(campusIdToUse),
            campus_name: anyEntity.campus_name || `Campus ${campusIdToUse}`,
            campus_code: campusCodeFromId,
            code: campusCodeFromId,
          } as Campus;
        } else {
          setPreviewLoading(false);
          return;
        }
      }
      
      if (!oldId) {
        // Use a mock ID for preview if real ID is not available
        const mockId = formData.request_type === 'student' 
          ? `STU${selectedEntity.id.toString().padStart(3, '0')}` 
          : `TCH${selectedEntity.id.toString().padStart(3, '0')}`;
        
        // Convert shift values for preview
        const shiftMapping: { [key: string]: "M" | "A" } = {
          'morning': 'M',
          'afternoon': 'A',
          'M': 'M',
          'A': 'A'
        };

        // Convert shift properly
        let convertedShift: "M" | "A" = 'M';
        if (formData.to_shift) {
          const lowerShift = formData.to_shift.toLowerCase();
        if (lowerShift === 'm' || lowerShift === 'morning') {
          convertedShift = 'M';
        } else if (lowerShift === 'a' || lowerShift === 'afternoon') {
          convertedShift = 'A';
        } else if (shiftMapping[formData.to_shift]) {
          convertedShift = shiftMapping[formData.to_shift];
        }
        }

        const preview = await previewIDChange({
          old_id: mockId,
          new_campus_code: toCampus.code || toCampus.campus_code || 'MC001',
          new_shift: convertedShift,
          new_role: 'employee_code' in selectedEntity ? selectedEntity.role : undefined
        });
        
        setIdPreview(preview as IDPreview);
        return;
      }
      
        // Convert shift values for preview
        const shiftMapping: { [key: string]: "M" | "A" } = {
          'morning': 'M',
          'afternoon': 'A',
          'M': 'M',
          'A': 'A'
        };

      // Convert shift properly
      let convertedShift: "M" | "A" = 'M';
      if (formData.to_shift) {
        const lowerShift = formData.to_shift.toLowerCase();
        if (lowerShift === 'm' || lowerShift === 'morning') {
          convertedShift = 'M';
        } else if (lowerShift === 'a' || lowerShift === 'afternoon') {
          convertedShift = 'A';
        } else if (shiftMapping[formData.to_shift]) {
          convertedShift = shiftMapping[formData.to_shift];
        }
      }
      
      const preview = await previewIDChange({
        old_id: oldId,
        new_campus_code: toCampus.code || toCampus.campus_code || 'MC001',
        new_shift: convertedShift,
        new_role: 'employee_code' in selectedEntity ? selectedEntity.role : undefined
      });
      
      setIdPreview(preview as IDPreview);
    } catch (error: any) {
      
      // Better error handling for ID preview
      if (error.message?.includes('KeyError')) {
        toast.error('Missing required data for ID preview. Please check entity selection.');
      } else if (error.message?.includes('not a valid choice')) {
        toast.error('Invalid shift selection for ID preview.');
      } else {
        toast.error('Failed to load ID preview. Please try again.');
      }
    } finally {
      setPreviewLoading(false);
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedEntity) {
      toast.error('Please select a student or teacher');
      return;
    }
    
    // Check required fields based on transfer type
    if (formData.transfer_type === 'campus' && !formData.to_campus) {
      toast.error('Please select destination campus for campus transfer');
      return;
    }

    if (formData.transfer_type === 'shift' && !formData.to_shift) {
      toast.error('Please select destination shift for shift transfer');
      return;
    }

    if (!isPrincipal && (formData.transfer_type === 'class' || formData.transfer_type === 'shift') && !selectedToClassroomId) {
      toast.error('Please select destination class/section');
      return;
    }
    
    if (!formData.reason || formData.reason.trim().length < 20) {
      toast.error('Reason for transfer must be at least 20 characters long');
      return;
    }
    
    if (formData.reason.length > 500) {
      toast.error('Reason for transfer cannot exceed 500 characters');
      return;
    }

    // Handle grade skip transfer
    if (!isPrincipal && formData.transfer_type === 'grade_skipping') {
      if (!selectedEntity || !('student_id' in selectedEntity)) {
        toast.error('Please select a student first');
        setLoading(false);
        return;
      }
      if (!selectedToGradeId) {
        toast.error('Please select a target grade');
        setLoading(false);
        return;
      }
      if (!formData.reason || formData.reason.trim().length < 20) {
        toast.error('Please provide a reason (at least 20 characters)');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const currentDate = new Date().toISOString().split('T')[0];
        
        // Get actual grade ID from selected classroom if available (handles alternative grade scenario)
        let actualGradeId = parseInt(selectedToGradeId, 10);
        if (selectedToGradeSkipClassroomId) {
          const selectedSection = availableGradeSkipSections.find(
            opt => opt.id.toString() === selectedToGradeSkipClassroomId
          );
          if (selectedSection && selectedSection.grade_id) {
            actualGradeId = selectedSection.grade_id;
          }
        }
        
        const gradeSkipData: any = {
          student: selectedEntity.id,
          to_grade: actualGradeId,  // Use actual grade ID from selected classroom
          reason: formData.reason.trim(),
          requested_date: currentDate,
        };

        if (selectedToGradeSkipClassroomId) {
          gradeSkipData.to_classroom = parseInt(selectedToGradeSkipClassroomId, 10);
        }

        if (formData.to_shift && formData.to_shift !== 'B') {
          gradeSkipData.to_shift = formData.to_shift === 'M' ? 'morning' : 'afternoon';
        }

        await createGradeSkipTransfer(gradeSkipData);
        toast.success('Grade skip transfer request created successfully!');
        router.push('/admin/principals/transfers');
      } catch (error: any) {
        toast.error(error?.response?.data?.error || 'Failed to create grade skip transfer');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Placeholder: Campus Transfer will be configured later
    if (!isPrincipal && formData.transfer_type === 'campus') {
      toast.info('Campus Transfer will be configured later. For now, please use Section or Shift + Section.');
      setLoading(false);
      return;
    }
    
    // Set requested_date to current date automatically
    const currentDate = new Date().toISOString().split('T')[0];
    
    try {
      setLoading(true);

      // Non-principal: use new class/shift transfer APIs
      if (!isPrincipal) {
        const toClassroomIdNum = parseInt(selectedToClassroomId, 10);

        const selectedDestinationOption = formData.transfer_type === 'class'
          ? availableClassSections.find(opt => opt.id.toString() === selectedToClassroomId)
          : availableShiftSections.find(opt => opt.id.toString() === selectedToClassroomId);

        if (formData.transfer_type === 'class') {
          await createClassTransfer({
            student: selectedEntity.id,
            to_classroom: toClassroomIdNum,
            reason: formData.reason,
            requested_date: currentDate,
          });
          toast.success('Class transfer request created successfully!');
        } else if (formData.transfer_type === 'shift') {
          // Map local shift code to API shift value
          const toShift =
            formData.to_shift === 'M'
              ? 'morning'
              : formData.to_shift === 'A'
              ? 'afternoon'
              : 'morning';

          await createShiftTransfer({
            student: selectedEntity.id,
            to_shift: toShift as 'morning' | 'afternoon',
            to_classroom: toClassroomIdNum,
            reason: formData.reason,
            requested_date: currentDate,
          });
          toast.success('Shift transfer request created successfully!');
        }

        // Prepare letter data
        const anyEntity = selectedEntity as any;
        const fromCampusId = anyEntity.current_campus || anyEntity.campus;
        const fromCampus = campuses.find(c => c.id === fromCampusId)?.campus_name || anyEntity.campus_name || 'Current Campus';
        // For class/shift transfers, to campus is same as from campus
        const toCampus = fromCampus;
        const fromClass = `${anyEntity.current_grade || anyEntity.grade || ''} - ${anyEntity.section || ''}`.trim();
        const toClass = selectedDestinationOption ? `${selectedDestinationOption.grade_name} - ${selectedDestinationOption.section}` : '';

        setLetterData({
          entityName: 'name' in selectedEntity ? selectedEntity.name : selectedEntity.full_name,
          entityId: 'student_id' in selectedEntity ? selectedEntity.student_id : selectedEntity.employee_code,
          entityType: formData.request_type,
          fromCampus,
          fromShift: anyEntity.shift || formData.from_shift,
          fromClass: fromClass || undefined,
          toCampus,
          toShift: formData.to_shift === 'M' ? 'morning' : formData.to_shift === 'A' ? 'afternoon' : undefined,
          toClass: toClass || undefined,
          reason: formData.reason,
          requestedDate: currentDate,
          transferType: formData.transfer_type,
        });

        setShowLetter(true);
        return;
      }

      // Principal: keep existing campus/shift TransferRequest flow
      // Get the first available campus as default if current_campus is not available
      const defaultCampus = campuses.length > 0 ? campuses[0].id : 1;

      // Convert shift values to backend format
      const shiftMapping: { [key: string]: 'M' | 'A' } = {
        morning: 'M',
        afternoon: 'A',
        M: 'M',
        A: 'A',
      };

      // Ensure to_shift is properly converted
      let convertedToShift: 'M' | 'A' = 'M';
      if (formData.to_shift) {
        const lowerShift = formData.to_shift.toLowerCase();

        if (lowerShift === 'm' || lowerShift === 'morning') {
          convertedToShift = 'M';
        } else if (lowerShift === 'a' || lowerShift === 'afternoon') {
          convertedToShift = 'A';
        } else if (shiftMapping[formData.to_shift]) {
          convertedToShift = shiftMapping[formData.to_shift];
        }
      }

      // Convert from_shift as well
      let convertedFromShift: 'M' | 'A' = 'M';
      const entityShift = (selectedEntity as any).shift;
      if (entityShift) {
        const lowerShift = entityShift.toLowerCase();
        if (lowerShift === 'm' || lowerShift === 'morning') {
          convertedFromShift = 'M';
        } else if (lowerShift === 'a' || lowerShift === 'afternoon') {
          convertedFromShift = 'A';
        } else if (entityShift === 'M' || entityShift === 'A') {
          convertedFromShift = entityShift;
        }
      }

      const fromCampusId =
        (selectedEntity as any).current_campus ||
        (selectedEntity as any).campus ||
        defaultCampus;

      const transferTypeForRequest: 'campus' | 'shift' =
        formData.transfer_type === 'shift' ? 'shift' : 'campus';

      const transferData = {
        request_type: formData.request_type,
        from_campus: fromCampusId,
        from_shift: convertedFromShift,
        to_campus:
          formData.transfer_type === 'campus'
            ? parseInt(formData.to_campus)
            : fromCampusId,
        to_shift: convertedToShift,
        reason: formData.reason,
        requested_date: currentDate,
        notes: formData.notes,
        transfer_type: transferTypeForRequest,
        ...(formData.request_type === 'student'
          ? { student: selectedEntity.id }
          : { teacher: (selectedEntity as any).id }),
      };

      await createTransferRequest(transferData);
      toast.success('Transfer request created successfully!');

      // Prepare letter data for principal transfers
      const fromCampusObj = campuses.find(c => c.id === fromCampusId);
      const toCampusObj = campuses.find(c => c.id === (formData.transfer_type === 'campus' ? parseInt(formData.to_campus) : fromCampusId));
      
      setLetterData({
        entityName: 'name' in selectedEntity ? selectedEntity.name : selectedEntity.full_name,
        entityId: 'student_id' in selectedEntity ? selectedEntity.student_id : selectedEntity.employee_code,
        entityType: formData.request_type,
        fromCampus: fromCampusObj?.campus_name || 'Current Campus',
        fromShift: convertedFromShift,
        toCampus: toCampusObj?.campus_name || fromCampusObj?.campus_name || 'Destination Campus',
        toShift: convertedToShift,
        reason: formData.reason,
        requestedDate: currentDate,
        transferType: formData.transfer_type,
      });

      setShowLetter(true);
    } catch (error: any) {

      // Better error handling with specific messages
      if (error.message?.includes('not a valid choice')) {
        toast.error('Invalid shift selection. Please choose Morning or Afternoon.');
      } else if (error.message?.includes('Only principals can create')) {
        toast.error('You do not have permission to create transfer requests.');
      } else if (error.message?.includes('Invalid pk')) {
        toast.error('Invalid campus selection. Please try again.');
      } else if (error.message?.includes('KeyError')) {
        toast.error('Data validation error. Please check all fields and try again.');
      } else {
        toast.error(`Failed to create transfer request: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };
  
  const resetForm = () => {
    setFormData({
      request_type: 'student',
      transfer_type: (isPrincipal ? 'campus' : 'class'),
      from_campus: '',
      from_shift: 'M',
      to_campus: '',
      to_shift: 'M',
      entity_id: '',
      reason: '',
      notes: ''
    });
    setSelectedEntity(null);
    setSearchResults([]);
    setSearchQuery('');
    setIdPreview(null);
    setShowPreview(false);
    setAvailableClassSections([]);
    setAvailableShiftSections([]);
    setSelectedToClassroomId('');
    toast.success('Form reset successfully');
  };
  
  return (
    <div className="bg-gray-50 p-3 sm:p-4 md:p-6 pb-4 sm:pb-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            className="flex items-center gap-2 hover:bg-[#f2f6fa] border-[#a3cef1] w-full sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="sm:hidden">Go Back</span>
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="flex-1 w-full sm:w-auto">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <ArrowRightLeft className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 flex-shrink-0" style={{ color: '#274c77' }} />
                <span>Create Transfer Request</span>
              </div>
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              {isPrincipal
                ? 'Create campus or shift transfers between campuses'
                : 'Create class or shift transfer requests for students'}
            </p>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
          {/* Main Form Container */}
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5" style={{ background: 'linear-gradient(to right, #274c77, #6096ba)' }}>
              <h2 className="text-base sm:text-lg md:text-xl font-semibold text-white flex items-center gap-2">
                    <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                Transfer Information
              </h2>
              <p className="text-xs sm:text-sm md:text-base text-white/90 mt-0.5 sm:mt-1">Fill in the details below to create a transfer request</p>
            </div>
            
            <div className="p-4 sm:p-5 md:p-6 space-y-4 md:space-y-5">
              {/* Top Controls: Transfer Type + Category */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                {/* Transfer Type Selection (Student vs Teacher) */}
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-semibold text-gray-700 tracking-wide">
                    Transfer Type
                  </Label>
                  <Select
                    value={formData.request_type}
                    onValueChange={(value: 'student' | 'teacher') => {
                      if (value === 'teacher' && !isPrincipal) return; // Only principals can create teacher transfers
                      setFormData(prev => ({ ...prev, request_type: value }));
                      setSelectedEntity(null);
                      setSearchResults([]);
                      setSearchQuery('');
                    }}
                  >
                    <SelectTrigger className="w-full py-3 text-base border-2 border-gray-200 rounded-xl transition-all duration-200" style={{ borderColor: '#a3cef1' }}>
                      <SelectValue placeholder="Select transfer type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">
                        <div className="flex items-center gap-2">
                          <GraduationCap className="h-4 w-4" />
                          Student Transfer
                        </div>
                      </SelectItem>
                      {isPrincipal && (
                        <SelectItem value="teacher">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Teacher Transfer
                          </div>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-semibold text-gray-700 tracking-wide">
                    Transfer Category
                  </Label>
                  {!isPrincipal ? (
                    <Select
                      value={formData.transfer_type}
                      onValueChange={(value) => {
                        setFormData(prev => {
                          const newData = {
                            ...prev,
                            transfer_type: value as 'campus' | 'shift' | 'class' | 'grade_skipping',
                          };
                          // Auto-select opposite shift for shift transfer
                          if (value === 'shift' && selectedEntity) {
                            const currentShift = selectedEntity.shift;
                            const shiftStr = String(currentShift).toLowerCase();
                            const normalizedShift = 
                              currentShift === 'M' || shiftStr === 'morning' ? 'M' :
                              currentShift === 'A' || shiftStr === 'afternoon' ? 'A' :
                              null;
                            
                            if (normalizedShift === 'M') {
                              newData.to_shift = 'A';
                            } else if (normalizedShift === 'A') {
                              newData.to_shift = 'M'; 
                            }
                          }
                          return newData;
                        });
                        setSelectedToClassroomId('');
                      }}
                    >
                      <SelectTrigger className="w-full py-3 text-base border-2 border-gray-200 rounded-xl transition-all duration-200" style={{ borderColor: '#a3cef1' }}>
                        <SelectValue placeholder="Select transfer category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="class">
                          <div className="flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4" />
                            Section Transfer
                          </div>
                        </SelectItem>
                        <SelectItem value="shift">
                          <div className="flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4" />
                            Shift + Section Transfer
                          </div>
                        </SelectItem>
                        <SelectItem value="grade_skipping">
                          <div className="flex items-center gap-2">
                            <GraduationCap className="h-4 w-4" />
                            Grade Skipping
                          </div>
                        </SelectItem>
                        <SelectItem value="campus">
                          <div className="flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4" />
                            Campus Transfer
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={formData.transfer_type}
                      onValueChange={(value: 'campus' | 'shift') => {
                        setFormData(prev => ({ ...prev, transfer_type: value }));
                      }}
                    >
                      <SelectTrigger className="w-full py-3 text-base border-2 border-gray-200 rounded-xl transition-all duration-200" style={{ borderColor: '#a3cef1' }}>
                        <SelectValue placeholder="Select transfer category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="campus">
                          <div className="flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4" />
                            Campus Transfer
                          </div>
                        </SelectItem>
                        <SelectItem value="shift">
                          <div className="flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4" />
                            Shift Transfer
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Entity Search Section */}
              <div className="space-y-2 sm:space-y-3">
                <Label className="text-sm sm:text-base font-semibold text-gray-700">
                    Select {formData.request_type === 'student' ? 'Student' : 'Teacher'}
                </Label>
                
                {/* Search Input with Button */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                        <Input
                      placeholder={`Search ${formData.request_type}s by name or ID...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-lg sm:rounded-xl transition-all duration-200"
                      style={{ '--tw-ring-color': '#a3cef1' } as React.CSSProperties}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#6096ba';
                        e.target.style.boxShadow = '0 0 0 2px rgba(96, 150, 186, 0.2)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '';
                        e.target.style.boxShadow = '';
                      }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          searchEntity();
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={searchEntity}
                    disabled={searching || !searchQuery.trim()}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base text-white font-medium rounded-lg sm:rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: '#274c77' }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#356c9b'; }}
                    onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#274c77'; }}
                  >
                    {searching ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span className="hidden sm:inline">Searching...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        <span>Search</span>
                      </div>
                    )}
                  </Button>
                    </div>
                    
                    {/* Search Results */}
                    {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <p className="text-sm font-medium text-gray-600 mb-3">
                      Found {searchResults.length} {formData.request_type}(s):
                    </p>
                        {searchResults.map((entity) => (
                          <div
                            key={entity.id}
                            onClick={() => selectEntity(entity)}
                        className="p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-white hover:shadow-md transition-all duration-200 bg-white"
                          >
                            <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#d7e3ef' }}>
                              {formData.request_type === 'student' ? (
                                <GraduationCap className="h-5 w-5" style={{ color: '#274c77' }} />
                              ) : (
                                <User className="h-5 w-5" style={{ color: '#274c77' }} />
                              )}
                            </div>
                              <div>
                              <p className="font-semibold text-gray-900">
                                {'name' in entity ? entity.name : entity.full_name}
                              </p>
                              <p className="text-sm text-gray-500">
                                  {'student_id' in entity ? entity.student_id : entity.employee_code}
                                </p>
                              </div>
                          </div>
                          <Badge variant="outline" className="border-[#a3cef1]" style={{ backgroundColor: '#f2f6fa', color: '#274c77' }}>
                            {formData.request_type === 'student' ? 'Student' : 'Teacher'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Selected Entity */}
                    {selectedEntity && (
                  <div className="p-3 sm:p-4 rounded-lg sm:rounded-xl" style={{ backgroundColor: '#f2f6fa', border: '2px solid #a3cef1' }}>
                    <div className="flex items-center justify-between gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#d7e3ef' }}>
                          {formData.request_type === 'student' ? (
                            <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: '#274c77' }} />
                          ) : (
                            <User className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: '#274c77' }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm sm:text-base truncate" style={{ color: '#274c77' }}>
                            {'name' in selectedEntity ? selectedEntity.name : selectedEntity.full_name}
                          </p>
                          <p className="text-xs sm:text-sm truncate" style={{ color: '#6096ba' }}>
                            {'student_id' in selectedEntity ? selectedEntity.student_id : selectedEntity.employee_code}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedEntity(null);
                          setFormData(prev => ({ ...prev, entity_id: '' }));
                        }}
                        className="border-[#a3cef1] hover:bg-[#f2f6fa] flex-shrink-0"
                        style={{ color: '#274c77' }}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Two-Column Layout: Current vs New (balanced cards) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 items-stretch">
                {/* Left Column - Current/Old Data */}
                <div className="space-y-2 sm:space-y-3 h-full">
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 border-gray-200 h-full flex flex-col">
                    <h3 className="text-sm sm:text-base md:text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                      <div className="w-6 h-6 sm:w-7 sm:h-7 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-sm sm:text-base">O</span>
                      </div>
                      <span>Current Information</span>
                    </h3>
                    
                    {selectedEntity ? (
                      <div className="space-y-2 flex-1">
                        <div className="bg-white p-2.5 sm:p-3 rounded-lg border border-gray-200">
                          <Label className="text-xs sm:text-sm font-medium text-gray-600">Name</Label>
                          <p className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 mt-0.5 sm:mt-1 leading-snug break-words">
                            {'name' in selectedEntity ? selectedEntity.name : selectedEntity.full_name}
                          </p>
                        </div>
                        
                        <div className="bg-white p-2.5 sm:p-3 rounded-lg border border-gray-200">
                          <Label className="text-xs sm:text-sm font-medium text-gray-600">ID</Label>
                          <p className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 mt-0.5 sm:mt-1 leading-snug break-all">
                            {'student_id' in selectedEntity ? selectedEntity.student_id : selectedEntity.employee_code}
                          </p>
                        </div>
                        
                        <div className="bg-white p-2.5 sm:p-3 rounded-lg border border-gray-200">
                          <Label className="text-xs sm:text-sm font-medium text-gray-600">Current Campus</Label>
                          <p className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 mt-0.5 sm:mt-1 leading-snug break-words">
                            {(() => {
                              // Prefer campus_name from entity if present
                              const anyEntity = selectedEntity as any;
                              if (anyEntity.campus_name) {
                                return anyEntity.campus_name;
                              }

                              const campusId =
                                selectedEntity.current_campus ||
                                anyEntity.campus ||
                                anyEntity.current_campus_id ||
                                anyEntity.campus_id;

                              if (!campusId) return 'Not Available';
                              const campus = campuses.find(c => c.id === campusId);
                              if (campus) {
                                return `${campus.campus_name} (${campus.code || campus.campus_code || 'N/A'})`;
                              }
                              return `Campus ID: ${campusId}`;
                            })()}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="bg-white p-2.5 sm:p-3 rounded-lg border border-gray-200">
                            <Label className="text-xs sm:text-sm font-medium text-gray-600">Current Shift</Label>
                            <p className="text-xs sm:text-sm font-semibold text-gray-900 mt-0.5 sm:mt-1 leading-snug">
                              {selectedEntity.shift === 'M'
                                ? 'Morning'
                                : selectedEntity.shift === 'A'
                                ? 'Afternoon'
                                : (selectedEntity as any).shift || 'Not Available'}
                            </p>
                          </div>
                          <div className="bg-white p-2.5 sm:p-3 rounded-lg border border-gray-200">
                            <Label className="text-xs sm:text-sm font-medium text-gray-600">
                              Current Grade / Section
                            </Label>
                            <p className="text-xs sm:text-sm font-semibold text-gray-900 mt-0.5 sm:mt-1 leading-snug">
                              {(() => {
                                const anyEntity = selectedEntity as any;
                                const grade =
                                  anyEntity.current_grade ||
                                  anyEntity.grade ||
                                  anyEntity.grade_name;
                                const section =
                                  anyEntity.section ||
                                  anyEntity.class_section ||
                                  anyEntity.classroom_section;
                                if (!grade && !section) return 'Not Available';
                                return `${grade || '-'}${section ? ` (${section})` : ''}`;
                              })()}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="bg-white p-2.5 sm:p-3 rounded-lg border border-gray-200">
                            <Label className="text-xs sm:text-sm font-medium text-gray-600">
                              Class Teacher
                            </Label>
                            <p className="text-xs sm:text-sm font-semibold text-gray-900 mt-0.5 sm:mt-1 break-words">
                              {(() => {
                                const anyEntity = selectedEntity as any;
                                return (
                                  anyEntity.class_teacher_name ||
                                  anyEntity.class_teacher ||
                                  'Not Available'
                                );
                              })()}
                            </p>
                          </div>
                          <div className="bg-white p-2.5 sm:p-3 rounded-lg border border-gray-200">
                            <Label className="text-xs sm:text-sm font-medium text-gray-600">
                              Coordinator
                            </Label>
                            <p className="text-xs sm:text-sm font-semibold text-gray-900 mt-0.5 sm:mt-1 break-words">
                              {(() => {
                                const anyEntity = selectedEntity as any;
                                return (
                                  anyEntity.coordinator_name ||
                                  anyEntity.coordinator ||
                                  'Not Available'
                                );
                              })()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 text-center py-8 text-gray-500 flex flex-col items-center justify-center">
                        <User className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                        <p>Please select a {formData.request_type} to view current information</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - New/Transfer Data */}
                <div className="space-y-2 sm:space-y-3 h-full">
                  <div className="p-3 sm:p-4 rounded-lg sm:rounded-xl h-full flex flex-col" style={{ background: 'linear-gradient(to right, #f2f6fa, #e7ecef)', border: '2px solid #a3cef1' }}>
                    <h3 className="text-sm sm:text-base md:text-lg font-bold mb-2 flex items-center gap-2" style={{ color: '#274c77' }}>
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#274c77' }}>
                        <span className="text-white font-bold text-xs sm:text-sm">N</span>
                      </div>
                      <span>Transfer Information</span>
                    </h3>
                    
                  <div className="space-y-2 sm:space-y-3 flex-1">
                      {/* Dynamic Form Based on Transfer Type */}
                      {isPrincipal && formData.transfer_type === 'campus' && (
                        <div className="bg-white p-2.5 sm:p-3 rounded-lg" style={{ border: '1px solid #a3cef1' }}>
                          <Label className="text-xs sm:text-sm font-medium" style={{ color: '#274c77' }}>Destination Campus</Label>
                      <Select
                        value={formData.to_campus}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, to_campus: value }))}
                      >
                            <SelectTrigger className="py-2 sm:py-2.5 text-sm rounded-lg transition-all duration-200 mt-1.5" style={{ border: '2px solid #a3cef1' }}>
                          <SelectValue placeholder="Select destination campus" />
                        </SelectTrigger>
                        <SelectContent>
                              {loading ? (
                                <SelectItem value="loading" disabled>Loading campuses...</SelectItem>
                              ) : Array.isArray(campuses) && campuses.length > 0 ? (
                                campuses.map((campus) => (
                            <SelectItem key={campus.id} value={campus.id.toString()}>
                                    {campus.campus_name} ({campus.code || campus.campus_code || 'N/A'})
                            </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="no-campuses" disabled>No campuses available</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      
                      {formData.transfer_type === 'shift' && selectedEntity && (() => {
                        // Get current shift and determine opposite shift
                        const currentShift = selectedEntity.shift;
                        // Normalize shift value (handle both 'M'/'A' and 'morning'/'afternoon')
                        const shiftStr = String(currentShift).toLowerCase();
                        const normalizedShift = 
                          currentShift === 'M' || shiftStr === 'morning' ? 'M' :
                          currentShift === 'A' || shiftStr === 'afternoon' ? 'A' :
                          null;
                        
                        const oppositeShift = normalizedShift === 'M' ? 'A' : normalizedShift === 'A' ? 'M' : null;
                        
                        // Use the opposite shift directly, don't rely on formData.to_shift
                        const displayValue = oppositeShift || 'A';
                        
                        return (
                          <div className="bg-white p-2.5 sm:p-3 rounded-lg" style={{ border: '1px solid #a3cef1' }}>
                            <Label className="text-xs sm:text-sm font-medium" style={{ color: '#274c77' }}>Destination Shift</Label>
                            <Select
                              value={displayValue} // Always use opposite shift
                              onValueChange={(value: 'M' | 'A') => {
                                // Always update to the opposite shift value
                                if (oppositeShift && value === oppositeShift) {
                                  setFormData(prev => ({ ...prev, to_shift: value }));
                                } else if (oppositeShift) {
                                  // Force to opposite shift if wrong value selected
                                  setFormData(prev => ({ ...prev, to_shift: oppositeShift }));
                                }
                              }}
                            >
                              <SelectTrigger className="py-2 sm:py-2.5 text-sm rounded-lg transition-all duration-200 mt-1.5" style={{ border: '2px solid #a3cef1' }}>
                                <SelectValue placeholder="Select destination shift" />
                              </SelectTrigger>
                              <SelectContent>
                                {oppositeShift ? (
                                  // Only show opposite shift
                                  <SelectItem value={oppositeShift}>
                                    {oppositeShift === 'M' ? 'Morning' : 'Afternoon'}
                                  </SelectItem>
                                ) : (
                                  // Fallback: show both if shift is unknown
                                  <>
                                    <SelectItem value="M">Morning</SelectItem>
                                    <SelectItem value="A">Afternoon</SelectItem>
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })()}
                      
                      {/* Both campus and shift for campus transfer (principal only) */}
                      {isPrincipal && formData.transfer_type === 'campus' && (
                        <div className="bg-white p-2.5 sm:p-3 rounded-lg" style={{ border: '1px solid #a3cef1' }}>
                          <Label className="text-xs sm:text-sm font-medium" style={{ color: '#274c77' }}>Destination Shift</Label>
                      <Select
                        value={formData.to_shift}
                            onValueChange={(value: 'M' | 'A') => {
                              setFormData(prev => ({ ...prev, to_shift: value }));
                            }}
                      >
                            <SelectTrigger className="py-2 sm:py-2.5 text-sm rounded-lg transition-all duration-200 mt-1.5" style={{ border: '2px solid #a3cef1' }}>
                              <SelectValue placeholder="Select destination shift" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="M">Morning</SelectItem>
                              <SelectItem value="A">Afternoon</SelectItem>
                        </SelectContent>
                      </Select>
                        </div>
                      )}

                      {/* Destination classroom for class/shift transfers (teacher/coordinator) */}
                      {!isPrincipal && (formData.transfer_type === 'class' || formData.transfer_type === 'shift') && (
                        <div className="bg-white p-2.5 sm:p-3 rounded-lg space-y-2" style={{ border: '1px solid #a3cef1' }}>
                          <Label className="text-xs sm:text-sm font-medium" style={{ color: '#274c77' }}>
                            Destination Class / Section
                          </Label>
                          <Select
                            value={selectedToClassroomId}
                            onValueChange={value => setSelectedToClassroomId(value)}
                          >
                            <SelectTrigger className="py-2 sm:py-2.5 text-sm rounded-lg transition-all duration-200 mt-1.5" style={{ border: '2px solid #a3cef1' }}>
                              <SelectValue placeholder="Select destination class / section" />
                            </SelectTrigger>
                            <SelectContent>
                              {(formData.transfer_type === 'class'
                                ? availableClassSections
                                : availableShiftSections
                              ).length === 0 ? (
                                <SelectItem value="no-options" disabled>
                                  No suitable classes available
                                </SelectItem>
                              ) : (
                                (formData.transfer_type === 'class'
                                  ? availableClassSections
                                  : availableShiftSections
                                ).map(option => (
                                  <SelectItem key={option.id} value={option.id.toString()}>
                                    {option.label}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>

                          {/* Message when no classes/sections available */}
                          {selectedEntity && (formData.transfer_type === 'class'
                            ? availableClassSections
                            : availableShiftSections
                          ).length === 0 && (
                            <div className="mt-2 p-3 sm:p-4 rounded-lg flex flex-col items-center justify-center text-center min-h-[120px] sm:min-h-[150px]" style={{ backgroundColor: '#fff3cd', border: '2px solid #ffc107' }}>
                              <div className="mb-2 sm:mb-3">
                                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: '#ffc107' }}>
                                  <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: '#856404' }} />
                                </div>
                              </div>
                              <h3 className="text-sm sm:text-base font-bold mb-1.5" style={{ color: '#856404' }}>
                                No Available Classes/Sections
                              </h3>
                              <p className="text-xs leading-relaxed max-w-md px-2" style={{ color: '#856404' }}>
                                {formData.transfer_type === 'class' 
                                  ? 'No suitable classes are available for transfer in the same campus and shift. Please contact the administrator for assistance.'
                                  : 'No suitable classes are available for transfer in the selected shift. Please contact the administrator for assistance.'}
                              </p>
                            </div>
                          )}

                          {selectedEntity && selectedDestinationOption && (
                            <div className="mt-3 rounded-lg p-2.5 sm:p-3 text-xs space-y-1" style={{ backgroundColor: '#f2f6fa', border: '1px solid #d7e3ef', color: '#274c77' }}>
                              <div className="font-semibold flex items-center gap-2">
                                <ArrowRightLeft className="h-3 w-3" />
                                Transfer Summary
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                  <p className="font-medium">From</p>
                                  <p className="text-xs font-semibold text-gray-900">
                                    {(() => {
                                      const anyEntity = selectedEntity as any;
                                      const grade =
                                        anyEntity.current_grade ||
                                        anyEntity.grade ||
                                        anyEntity.grade_name ||
                                        '-';
                                      const section =
                                        anyEntity.section ||
                                        anyEntity.class_section ||
                                        anyEntity.classroom_section ||
                                        '-';
                                      const shiftLabel = (() => {
                                        const rawShift = (selectedEntity as any).shift;
                                        if (rawShift === 'M') return 'Morning';
                                        if (rawShift === 'A') return 'Afternoon';
                                        return rawShift || '-';
                                      })();
                                      return `${grade} (${section}) • ${shiftLabel}`;
                                    })()}
                                  </p>
                                  <div className="text-[11px] text-gray-700 space-y-0.5">
                                    <div>
                                      <span className="text-[11px] font-medium text-gray-500">
                                        Student ID
                                      </span>
                                      <div className="text-[11px] font-mono font-semibold text-gray-900">
                                        {'student_id' in selectedEntity ? selectedEntity.student_id : selectedEntity.employee_code}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-[11px] font-medium text-gray-500">
                                        Class Teacher
                                      </span>
                                      <div className="text-[11px] font-semibold text-gray-900">
                                      {(() => {
                                        const anyEntity = selectedEntity as any;
                                        return (
                                          anyEntity.class_teacher_name ||
                                          anyEntity.class_teacher ||
                                          'Not Available'
                                        );
                                      })()}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-[11px] font-medium text-gray-500">
                                        Coordinator
                                      </span>
                                      <div className="text-[11px] font-semibold text-gray-900">
                                      {(() => {
                                        const anyEntity = selectedEntity as any;
                                        return (
                                          anyEntity.coordinator_name ||
                                          anyEntity.coordinator ||
                                          'Not Available'
                                        );
                                      })()}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <p className="font-medium">To</p>
                                  <p className="text-xs font-semibold text-gray-900">
                                    {selectedDestinationOption.grade_name} (
                                    {selectedDestinationOption.section}) •{' '}
                                    {selectedDestinationOption.shift}
                                  </p>
                                  <div className="text-[11px] text-gray-700 space-y-0.5">
                                    {formData.transfer_type === 'shift' && idPreview && (
                                      <div>
                                        <span className="text-[11px] font-medium text-gray-500">
                                          New Student ID
                                        </span>
                                        <div className="text-[11px] font-mono font-semibold" style={{ color: '#274c77' }}>
                                          {idPreview.new_id}
                                        </div>
                                      </div>
                                    )}
                                    <div>
                                      <span className="text-[11px] font-medium text-gray-500">
                                        Class Teacher
                                      </span>
                                      <div className="text-[11px] font-semibold text-gray-900">
                                        {selectedDestinationOption.class_teacher_name ||
                                          'Not Available'}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-[11px] font-medium text-gray-500">
                                        Coordinator
                                      </span>
                                      <div className="text-[11px] font-semibold text-gray-900">
                                        {selectedDestinationOption.coordinator_name ||
                                          'Not Available'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Grade Skip Transfer Fields */}
                      {!isPrincipal && formData.transfer_type === 'grade_skipping' && selectedEntity && (
                        <>
                          {/* Target Grade (auto-loaded, read-only display) */}
                          <div className="bg-white p-2.5 sm:p-3 rounded-lg space-y-2" style={{ border: '1px solid #a3cef1' }}>
                            <Label className="text-xs sm:text-sm font-medium" style={{ color: '#274c77' }}>
                              Target Grade (Skip Grade)
                            </Label>
                            {gradeSkipLoading ? (
                              <div className="py-2 text-sm text-gray-500">Loading grade...</div>
                            ) : availableGradeForSkip ? (
                              <div className="py-2 px-3 rounded-lg bg-gray-50 border border-gray-200">
                                <p className="text-sm font-semibold text-gray-900">{availableGradeForSkip.name}</p>
                                {availableGradeForSkip.level_name && (
                                  <p className="text-xs text-gray-600 mt-1">{availableGradeForSkip.level_name}</p>
                                )}
                              </div>
                            ) : (
                              <div className="py-2 text-sm text-red-600">No skip grade available</div>
                            )}
                          </div>

                          {/* Optional: Target Shift */}
                          {selectedEntity && (() => {
                            // Normalize shift value - handle both 'M'/'A' and 'morning'/'afternoon' formats
                            const currentShift = selectedEntity.shift;
                            const shiftStr = String(currentShift).toLowerCase();
                            const normalizedShift = 
                              currentShift === 'M' || shiftStr === 'morning' ? 'M' :
                              currentShift === 'A' || shiftStr === 'afternoon' ? 'A' :
                              'M'; // Default to Morning if unknown
                            
                            return (
                              <div className="bg-white p-2.5 sm:p-3 rounded-lg space-y-2" style={{ border: '1px solid #a3cef1' }}>
                                <Label className="text-xs sm:text-sm font-medium" style={{ color: '#274c77' }}>
                                  Target Shift (Optional)
                                </Label>
                                <Select
                                  value={formData.to_shift || normalizedShift}
                                  onValueChange={(value: 'M' | 'A' | 'B') => {
                                    setFormData(prev => ({ ...prev, to_shift: value }));
                                    setSelectedToGradeSkipClassroomId(''); // Reset section when shift changes
                                  }}
                                >
                                  <SelectTrigger className="py-2 sm:py-2.5 text-sm rounded-lg transition-all duration-200 mt-1.5" style={{ border: '2px solid #a3cef1' }}>
                                    <SelectValue placeholder="Select target shift (optional)" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={normalizedShift}>
                                      Keep Current Shift ({normalizedShift === 'M' ? 'Morning' : 'Afternoon'})
                                    </SelectItem>
                                    <SelectItem value={normalizedShift === 'M' ? 'A' : 'M'}>
                                      {normalizedShift === 'M' ? 'Afternoon' : 'Morning'}
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          })()}

                          {/* Optional: Target Section */}
                          {selectedToGradeId && (
                            <div className="bg-white p-2.5 sm:p-3 rounded-lg space-y-2" style={{ border: '1px solid #a3cef1' }}>
                              <Label className="text-xs sm:text-sm font-medium" style={{ color: '#274c77' }}>
                                Target Section (Optional)
                              </Label>
                              <Select
                                value={selectedToGradeSkipClassroomId}
                                onValueChange={value => setSelectedToGradeSkipClassroomId(value)}
                              >
                                <SelectTrigger className="py-2 sm:py-2.5 text-sm rounded-lg transition-all duration-200 mt-1.5" style={{ border: '2px solid #a3cef1' }}>
                                  <SelectValue placeholder="Select target section (optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableGradeSkipSections.length === 0 ? (
                                    <SelectItem value="no-options" disabled>
                                      No sections available
                                    </SelectItem>
                                  ) : (
                                    availableGradeSkipSections.map(option => (
                                      <SelectItem key={option.id} value={option.id.toString()}>
                                        {option.label}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              {availableGradeSkipSections.length > 0 && (
                                <p className="text-xs text-gray-600 mt-1">
                                  {availableGradeSkipSections.length} section(s) available
                                </p>
                              )}
                            </div>
                          )}

                          {/* Grade Skip Summary */}
                          {selectedEntity && availableGradeForSkip && (
                            <div className="mt-3 rounded-lg p-2.5 sm:p-3 text-xs space-y-1" style={{ backgroundColor: '#f2f6fa', border: '1px solid #d7e3ef', color: '#274c77' }}>
                              <div className="font-semibold flex items-center gap-2">
                                <GraduationCap className="h-3 w-3" />
                                Grade Skip Summary
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                  <p className="font-medium">From</p>
                                  <p className="text-xs font-semibold text-gray-900">
                                    {(() => {
                                      const anyEntity = selectedEntity as any;
                                      const grade = anyEntity.current_grade || anyEntity.grade || anyEntity.grade_name || '-';
                                      const section = anyEntity.section || anyEntity.class_section || anyEntity.classroom_section || '-';
                                      return `${grade} (${section})`;
                                    })()}
                                  </p>
                                </div>
                                <div className="space-y-1.5">
                                  <p className="font-medium">To</p>
                                  <p className="text-xs font-semibold text-gray-900">
                                    {availableGradeForSkip.name}
                                    {selectedToGradeSkipClassroomId && (() => {
                                      const selectedSection = availableGradeSkipSections.find(
                                        opt => opt.id.toString() === selectedToGradeSkipClassroomId
                                      );
                                      return selectedSection ? ` (${selectedSection.section})` : '';
                                    })()}
                                  </p>
                                </div>
                              </div>
                              
                              {/* Selected Section Details */}
                              {selectedToGradeSkipClassroomId && (() => {
                                const selectedSection = availableGradeSkipSections.find(
                                  opt => opt.id.toString() === selectedToGradeSkipClassroomId
                                );
                                if (!selectedSection) return null;
                                
                                return (
                                  <div className="mt-3 pt-3 border-t border-gray-300">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <div className="space-y-1.5">
                                        <p className="font-medium text-gray-600">Class Teacher</p>
                                        <p className="text-xs font-semibold text-gray-900">
                                          {selectedSection.class_teacher_name || 'Not Assigned'}
                                        </p>
                                      </div>
                                      <div className="space-y-1.5">
                                        <p className="font-medium text-gray-600">Coordinator</p>
                                        <p className="text-xs font-semibold text-gray-900">
                                          {selectedSection.coordinator_name || 'Not Assigned'}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ID Preview - Only show if there's an actual change in ID */}
              {selectedEntity && formData.to_shift && (formData.to_campus || (!isPrincipal && (formData.transfer_type === 'shift' || formData.transfer_type === 'grade_skipping'))) && idPreview && idPreview.old_id !== idPreview.new_id && (
                <div className="space-y-4">
                  <Label className="text-lg font-semibold text-gray-700">ID Preview</Label>
                  <div className="p-6 rounded-xl" style={{ background: 'linear-gradient(to right, #f2f6fa, #e7ecef)', border: '2px solid #a3cef1' }}>
                    {previewLoading ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 mx-auto mb-2" style={{ borderColor: '#274c77' }}></div>
                        <p className="text-sm text-gray-600">Loading preview...</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-white rounded-lg shadow-sm">
                          <div className="text-center">
                            <p className="text-sm text-gray-600 mb-1">Current ID</p>
                            <p className="font-mono font-bold text-lg text-gray-900">{idPreview.old_id}</p>
                          </div>
                          <ArrowRightLeft className="h-6 w-6" style={{ color: '#6096ba' }} />
                          <div className="text-center">
                            <p className="text-sm text-gray-600 mb-1">New ID</p>
                            <p className="font-mono font-bold text-lg" style={{ color: '#274c77' }}>{idPreview.new_id}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div className="text-center p-2 bg-white rounded">
                            <p className="text-gray-600">Campus</p>
                            <p className="font-semibold">{idPreview.changes.campus_code}</p>
                          </div>
                          <div className="text-center p-2 bg-white rounded">
                            <p className="text-gray-600">Shift</p>
                            <p className="font-semibold">{idPreview.changes.shift}</p>
                          </div>
                          <div className="text-center p-2 bg-white rounded">
                            <p className="text-gray-600">Year</p>
                            <p className="font-semibold">{idPreview.changes.year}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Request Details */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-gray-700 tracking-wide">
                    Request Details
                  </Label>
                </div>

                <div className="space-y-2 bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
                  <div className="space-y-1">
                    <Label htmlFor="reason" className="text-xs sm:text-sm font-medium text-gray-600">
                      Reason for Transfer <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="reason"
                      placeholder="Enter clear reason for this transfer (capacity, behaviour, parent request, etc.)"
                      value={formData.reason}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value.length <= 500) {
                          setFormData(prev => ({ ...prev, reason: value }));
                        }
                      }}
                      rows={3}
                      minLength={20}
                      maxLength={500}
                      className="mt-1 text-sm border border-gray-200 rounded-lg transition-all duration-200 resize-none"
                      onFocus={(e) => {
                        e.target.style.borderColor = '#6096ba';
                        e.target.style.boxShadow = '0 0 0 2px rgba(96, 150, 186, 0.2)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '';
                        e.target.style.boxShadow = '';
                      }}
                    />
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-500">
                        {formData.reason.length < 20 ? (
                          <span className="text-orange-600 font-medium">
                            Minimum {20 - formData.reason.length} more characters required
                          </span>
                        ) : (
                          <span>Minimum 20 characters required</span>
                        )}
                      </p>
                      <p className={`text-xs ${formData.reason.length > 500 ? 'text-red-600 font-medium' : formData.reason.length > 450 ? 'text-orange-600' : 'text-gray-500'}`}>
                        {formData.reason.length} / 500
                      </p>
                    </div>
                  </div>

                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-2 pb-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  className="w-full sm:w-auto px-5 sm:px-6 py-2 sm:py-2.5 text-sm font-medium border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200"
                >
                  Reset Form
                </Button>
                <Button
                  type="submit"
                  disabled={
                    loading ||
                    !selectedEntity ||
                    !formData.reason ||
                    formData.reason.trim().length < 20 ||
                    formData.reason.length > 500 ||
                    (formData.transfer_type === 'campus' && !formData.to_campus) ||
                    (formData.transfer_type === 'shift' && !formData.to_shift)
                  }
                  className="w-full sm:w-auto px-5 sm:px-6 py-2 sm:py-2.5 text-sm font-medium text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#274c77' }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#356c9b'; }}
                  onMouseLeave={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#274c77'; }}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-white"></div>
                      <span className="hidden sm:inline">Creating Transfer...</span>
                      <span className="sm:hidden">Creating...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                      <span className="hidden sm:inline">Create Transfer Request</span>
                      <span className="sm:hidden">Create Request</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}