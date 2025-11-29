'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  User,
  GraduationCap,
  Building,
  Calendar,
  AlertCircle,
  ArrowLeft,
  FileText,
  ArrowRightLeft,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getTransferRequests,
  approveTransfer,
  declineTransfer,
  cancelTransfer,
  TransferRequest,
  ClassTransfer,
  ShiftTransfer,
  GradeSkipTransfer,
  CampusTransfer,
  getClassTransfers,
  getShiftTransfers,
  getGradeSkipTransfers,
  getCampusTransfers,
  approveClassTransfer,
  declineClassTransfer,
  approveShiftTransferOwn,
  approveShiftTransferOther,
  declineShiftTransfer,
  approveGradeSkipOwnCoord,
  approveGradeSkipOtherCoord,
  declineGradeSkip,
  approveCampusTransferFromCoord,
  approveCampusTransferFromPrincipal,
  approveCampusTransferToPrincipal,
  confirmCampusTransfer,
  declineCampusTransfer,
  cancelCampusTransfer,
  getCampusTransferLetter,
  CampusTransferLetterPayload,
} from '@/lib/api';
import { getCurrentUserRole } from '@/lib/permissions';
import { getCurrentUserProfile } from '@/lib/api';

export default function TransferManagementPage() {
  const router = useRouter();
  const userRole = getCurrentUserRole();
  const isPrincipal = userRole === 'principal';
  const isTeacher = userRole === 'teacher';
  const isCoordinator = userRole === 'coordinator';

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const [outgoingRequests, setOutgoingRequests] = useState<TransferRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<TransferRequest[]>([]);

  const [classTransfers, setClassTransfers] = useState<ClassTransfer[]>([]);
  const [shiftTransfers, setShiftTransfers] = useState<ShiftTransfer[]>([]);
  const [gradeSkipTransfers, setGradeSkipTransfers] = useState<GradeSkipTransfer[]>([]);
  const [classStatusFilter, setClassStatusFilter] = useState<'pending' | 'history'>('pending');
  const [shiftStatusFilter, setShiftStatusFilter] = useState<'pending' | 'history'>('pending');
  const [gradeSkipStatusFilter, setGradeSkipStatusFilter] = useState<'pending' | 'history'>('pending');
  const [classDirectionFilter, setClassDirectionFilter] = useState<'incoming' | 'outgoing'>('incoming');
  const [shiftDirectionFilter, setShiftDirectionFilter] = useState<'incoming' | 'outgoing'>('incoming');
  const [gradeSkipDirectionFilter, setGradeSkipDirectionFilter] = useState<'incoming' | 'outgoing'>('incoming');
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null);
  const [expandedShiftId, setExpandedShiftId] = useState<number | null>(null);
  const [expandedGradeSkipId, setExpandedGradeSkipId] = useState<number | null>(null);
  
  // Current user IDs for filtering
  const [currentTeacherId, setCurrentTeacherId] = useState<number | null>(null);
  const [currentCoordinatorId, setCurrentCoordinatorId] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  // UI State
  const [selectedRequest, setSelectedRequest] = useState<TransferRequest | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const [selectedClassTransfer, setSelectedClassTransfer] = useState<ClassTransfer | null>(null);
  const [selectedShiftTransfer, setSelectedShiftTransfer] = useState<ShiftTransfer | null>(null);
  const [selectedGradeSkipTransfer, setSelectedGradeSkipTransfer] = useState<GradeSkipTransfer | null>(null);
  const [campusTransfers, setCampusTransfers] = useState<CampusTransfer[]>([]);
  const [campusStatusFilter, setCampusStatusFilter] = useState<'pending' | 'history'>('pending');
  const [campusDirectionFilter, setCampusDirectionFilter] = useState<'incoming' | 'outgoing'>('incoming');
  const [expandedCampusId, setExpandedCampusId] = useState<number | null>(null);
  const [selectedCampusTransfer, setSelectedCampusTransfer] = useState<CampusTransfer | null>(null);
  const [campusLetter, setCampusLetter] = useState<CampusTransferLetterPayload | null>(null);
  const [showCampusLetter, setShowCampusLetter] = useState(false);
  const [showCampusConfirmDialog, setShowCampusConfirmDialog] = useState(false);
  const [campusConfirmText, setCampusConfirmText] = useState('');


  // Load current user profile to get IDs
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const profile = await getCurrentUserProfile() as any;
        if (profile) {
          // Set user ID for all roles
          if (profile.id) {
            setCurrentUserId(profile.id);
          }
          if (profile.teacher_id) {
            setCurrentTeacherId(profile.teacher_id);
          }
          if (profile.coordinator_id) {
            setCurrentCoordinatorId(profile.coordinator_id);
          }
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };
    loadUserProfile();
  }, []);

  // Load data on mount based on role
  useEffect(() => {
    // All users now use the same unified view with 4 tabs
      loadTeacherCoordinatorTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrincipal, isTeacher, isCoordinator]);

  const loadTeacherCoordinatorTransfers = async () => {
    try {
      setLoading(true);
      const [classes, shifts, gradeSkips, campusAll] = await Promise.all([
        getClassTransfers(),
        getShiftTransfers(),
        getGradeSkipTransfers(),
        getCampusTransfers({ direction: 'all' }),
      ]);
      setClassTransfers(classes as ClassTransfer[]);
      setShiftTransfers(shifts as ShiftTransfer[]);
      setGradeSkipTransfers(gradeSkips as GradeSkipTransfer[]);
      setCampusTransfers(campusAll as CampusTransfer[]);
    } catch (error) {
      console.error('Error loading transfers:', error);
      toast.error('Failed to load transfer data');
    } finally {
      setLoading(false);
    }
  };

  const handleLetterDownload = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    if (!campusLetter) {
      toast.error('Letter is still loading. Please try again.');
      return;
    }

    const letterElement = document.getElementById('transfer-letter');
    if (!letterElement) {
      toast.error('Letter content is not ready yet. Please reopen and try again.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=650');
    if (!printWindow) {
      toast.error('Pop-up blocked. Please allow pop-ups to download the letter.');
      return;
    }

    const { document: printDocument } = printWindow;
    printDocument.open();
    printDocument.write('<!DOCTYPE html><html><head><title>Campus Transfer Letter</title>');

    const headNodes = Array.from(document.querySelectorAll('style, link[rel=\"stylesheet\"]'));
    headNodes.forEach((node) => {
      printDocument.write(node.outerHTML);
    });

    printDocument.write(`
      <style>
        @page { margin: 20mm; }
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          font-family: 'Inter', 'Segoe UI', sans-serif;
          background: #ffffff;
        }
      </style>
    `);

    printDocument.write('</head><body class=\"bg-white\">');
    printDocument.write(letterElement.outerHTML);
    printDocument.write('</body></html>');
    printDocument.close();

    const triggerPrint = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };

    if (printWindow.document.readyState === 'complete') {
      triggerPrint();
    } else {
      printWindow.onload = () => triggerPrint();
    }
  };

  // Principal actions
  const handleApprove = async (requestId: number) => {
    try {
      setActionLoading(requestId);
      await approveTransfer(requestId);
      toast.success('Transfer approved successfully');
      await loadTeacherCoordinatorTransfers();
    } catch (error: any) {
      console.error('Error approving transfer:', error);
      toast.error(error.message || 'Failed to approve transfer');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async () => {
    if (!selectedRequest || !declineReason.trim()) {
      toast.error('Please provide a reason for declining');
      return;
    }

    try {
      setActionLoading(selectedRequest.id);
      await declineTransfer(selectedRequest.id, declineReason);
      toast.success('Transfer declined successfully');
      setShowDeclineDialog(false);
      setDeclineReason('');
      setSelectedRequest(null);
      await loadTeacherCoordinatorTransfers();
    } catch (error: any) {
      console.error('Error declining transfer:', error);
      toast.error(error.message || 'Failed to decline transfer');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (requestId: number) => {
    try {
      setActionLoading(requestId);
      await cancelTransfer(requestId);
      toast.success('Transfer cancelled successfully');
      await loadTeacherCoordinatorTransfers();
    } catch (error: any) {
      console.error('Error cancelling transfer:', error);
      toast.error(error.message || 'Failed to cancel transfer');
    } finally {
      setActionLoading(null);
    }
  };
  
  const getStatusBadge = (status: string) => {
    const variants = {
      draft: 'secondary',
      pending: 'default',
      approved: 'default',
      declined: 'destructive',
      cancelled: 'outline'
    } as const;
    
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      declined: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-600'
    };
    
    return (
      <Badge className={colors[status as keyof typeof colors]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'declined':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };
  
  const renderRequestCard = (request: TransferRequest, isOutgoing: boolean) => (
    <Card key={request.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-3 sm:p-4 md:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-3 sm:gap-4">
          <div className="flex-1 w-full">
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
              {request.request_type === 'student' ? (
                <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
              ) : (
                <User className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-sm sm:text-base md:text-lg truncate">
                  {request.entity_name}
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 truncate break-all">
                  {request.current_id}
                </p>
              </div>
              <div className="flex-shrink-0">{getStatusIcon(request.status)}</div>
            </div>
            
            <div className="space-y-1.5 sm:space-y-2 mb-3 sm:mb-4">
              <div className="flex items-start sm:items-center gap-2 text-xs sm:text-sm">
                <Building className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">From: </span>
                  <span className="break-words">{request.from_campus_name} ({request.from_shift === 'M' ? 'Morning' : 'Afternoon'})</span>
              </div>
              </div>
              <div className="flex items-start sm:items-center gap-2 text-xs sm:text-sm">
                <Building className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">To: </span>
                  <span className="break-words">{request.to_campus_name} ({request.to_shift === 'M' ? 'Morning' : 'Afternoon'})</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                <span className="font-medium">Requested: </span>
                <span>{new Date(request.requested_date).toLocaleDateString()}</span>
              </div>
            </div>
            
            <div className="mb-3 sm:mb-4">
              <p className="text-xs sm:text-sm text-gray-700 break-words">
                <span className="font-medium">Reason: </span>{request.reason}
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                {getStatusBadge(request.status)}
                {request.decline_reason && (
                  <Badge variant="outline" className="text-red-600 text-xs">
                    {request.decline_reason}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedRequest(request);
                    setShowDetails(true);
                  }}
                  className="text-xs sm:text-sm"
                >
                  <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                  View
                </Button>
                
                {/* Action buttons based on status and direction */}
                {isOutgoing ? (
                  // Outgoing requests - can cancel if pending
                  request.status === 'pending' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleCancel(request.id)}
                      disabled={actionLoading === request.id}
                      className="text-xs sm:text-sm"
                    >
                      {actionLoading === request.id ? 'Cancelling...' : 'Cancel'}
                    </Button>
                  )
                ) : (
                  // Incoming requests - can approve/decline if pending
                  request.status === 'pending' && (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleApprove(request.id)}
                        disabled={actionLoading === request.id}
                        className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                      >
                        {actionLoading === request.id ? 'Approving...' : 'Approve'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request);
                          setShowDeclineDialog(true);
                        }}
                        disabled={actionLoading === request.id}
                        className="text-xs sm:text-sm"
                      >
                        Decline
                      </Button>
                    </>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // ---------------- Teacher/Coordinator: Class & Shift transfers ----------

  const renderClassTransferCard = (transfer: ClassTransfer) => {
    const isExpanded = expandedClassId === transfer.id;

    const fromText = transfer.from_grade_name
      ? `${transfer.from_grade_name}${transfer.from_section ? ` (${transfer.from_section})` : ''}`
      : transfer.from_classroom_display || '-';

    const toText = transfer.to_grade_name
      ? `${transfer.to_grade_name}${transfer.to_section ? ` (${transfer.to_section})` : ''}`
      : transfer.to_classroom_display || '-';

    return (
      <Card
        key={transfer.id}
        className="hover:shadow-md transition-shadow border border-gray-100 rounded-lg sm:rounded-xl md:rounded-2xl bg-white/80"
      >
        <CardContent className="p-2.5 sm:p-3 md:p-4">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() =>
                setExpandedClassId(prev => (prev === transfer.id ? null : transfer.id))
              }
              className="flex-1 flex items-center justify-between gap-2 sm:gap-3 text-left"
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <h3 className="font-semibold text-xs sm:text-sm md:text-base text-gray-900 truncate">
                      {transfer.student_name}
                    </h3>
                    <div className="flex-shrink-0">{getStatusIcon(transfer.status)}</div>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-gray-500 truncate">
                    {transfer.student_id}
                  </p>
                </div>
              </div>

              <div className="hidden md:flex flex-col items-end text-[10px] sm:text-[11px] text-gray-600 flex-1 min-w-0">
                <span className="font-medium text-gray-700 truncate">
                  {fromText} <span className="mx-1 text-gray-400">→</span> {toText}
                </span>
                <span className="truncate">
                  {new Date(transfer.requested_date).toLocaleDateString()}
                  {transfer.initiated_by_teacher_name
                    ? ` · ${transfer.initiated_by_teacher_name}`
                    : ''}
                </span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <div className="hidden sm:block">{getStatusBadge(transfer.status)}</div>
                <ChevronDown
                  className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
          </div>

          {/* Expanded details */}
          {isExpanded && (
            <div className="mt-2 sm:mt-3 border-t border-blue-100 pt-2 sm:pt-3 space-y-2 sm:space-y-3 text-xs sm:text-sm md:text-base">
              {/* From / To summary */}
              <div className="rounded-lg sm:rounded-xl border border-blue-100 bg-blue-50/70 px-2.5 sm:px-3 py-2 text-blue-900">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                  <ArrowRightLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4" />
                  <span className="font-semibold text-[10px] sm:text-xs">Class Transfer</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div className="space-y-0.5">
                    <p className="text-[11px] uppercase tracking-wide text-blue-700 font-semibold">
                      From
                    </p>
                    <p className="font-semibold">{fromText}</p>
                    {transfer.initiated_by_teacher_name && (
                      <p className="text-[11px] text-blue-800">
                        Class Teacher: {transfer.initiated_by_teacher_name}
                      </p>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] uppercase tracking-wide text-blue-700 font-semibold">
                      To
                    </p>
                    <p className="font-semibold">{toText}</p>
                    {transfer.coordinator_name && (
                      <p className="text-[11px] text-blue-800">
                        Coordinator: {transfer.coordinator_name}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="text-sm text-gray-700">
                <span className="font-medium">Reason:</span>{' '}
                <span>{transfer.reason}</span>
              </div>

              {/* Footer: status + actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 pt-1 sm:pt-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(transfer.status)}
                  {transfer.decline_reason && (
                    <Badge variant="outline" className="text-red-600 text-[10px] sm:text-xs">
                      {transfer.decline_reason}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {isCoordinator && transfer.status === 'pending' && (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={async () => {
                          try {
                            setActionLoading(transfer.id);
                            await approveClassTransfer(transfer.id);
                            toast.success('Class transfer approved');
                            await loadTeacherCoordinatorTransfers();
                          } catch (error: any) {
                            console.error('Error approving class transfer:', error);
                            toast.error(
                              error.message || 'Failed to approve class transfer',
                            );
                          } finally {
                            setActionLoading(null);
                          }
                        }}
                        disabled={actionLoading === transfer.id}
                        className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                      >
                        {actionLoading === transfer.id ? 'Approving...' : 'Approve'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setSelectedClassTransfer(transfer);
                          setDeclineReason('');
                          setShowDeclineDialog(true);
                        }}
                        disabled={actionLoading === transfer.id}
                        className="text-xs sm:text-sm"
                      >
                        Decline
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderShiftTransferCard = (transfer: ShiftTransfer) => {
    const isExpanded = expandedShiftId === transfer.id;

    const fromText =
      (transfer.from_classroom_display || 'Current class') +
      ' • ' +
      transfer.from_shift;
    const toText =
      (transfer.to_classroom_display || 'Same grade/section') +
      ' • ' +
      transfer.to_shift;

    return (
      <Card
        key={transfer.id}
        className="hover:shadow-md transition-shadow border border-gray-100 rounded-lg sm:rounded-xl md:rounded-2xl bg-white/80"
      >
        <CardContent className="p-2.5 sm:p-3 md:p-4 lg:p-5">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() =>
                setExpandedShiftId(prev => (prev === transfer.id ? null : transfer.id))
              }
              className="flex-1 flex items-center justify-between gap-2 sm:gap-3 text-left"
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <GraduationCap className="h-4 w-4 sm:h-4 md:h-5 md:w-5 text-indigo-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-xs sm:text-sm md:text-base text-gray-900 truncate">
                    {transfer.student_name}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-gray-500 truncate">
                    {transfer.student_id}
                    {transfer.requesting_teacher_name
                      ? ` · ${transfer.requesting_teacher_name}`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <div className="hidden sm:block">{getStatusBadge(transfer.status)}</div>
                <ChevronDown
                  className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
          </div>

          {/* Expanded details */}
          {isExpanded && (
            <div className="mt-2 sm:mt-3 border-t border-indigo-100 pt-2 sm:pt-3 space-y-2 sm:space-y-3 text-xs sm:text-sm md:text-base">
              {/* From / To summary */}
              <div className="rounded-lg sm:rounded-xl border border-indigo-100 bg-indigo-50/70 px-2.5 sm:px-3 py-2 text-indigo-900">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                  <ArrowRightLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4" />
                  <span className="font-semibold text-[10px] sm:text-xs">Shift Transfer</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div className="space-y-0.5">
                    <p className="text-[11px] uppercase tracking-wide text-indigo-700 font-semibold">
                      From
                    </p>
                    <p className="font-semibold">{fromText}</p>
                    {transfer.from_shift_coordinator_name && (
                      <p className="text-[11px] text-indigo-800">
                        Coordinator: {transfer.from_shift_coordinator_name}
                      </p>
                    )}
                    {transfer.campus_name && (
                      <p className="text-[11px] text-indigo-800">
                        Campus: {transfer.campus_name}
                      </p>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] uppercase tracking-wide text-indigo-700 font-semibold">
                      To
                    </p>
                    <p className="font-semibold">{toText}</p>
                    {transfer.to_shift_coordinator_name && (
                      <p className="text-[11px] text-indigo-800">
                        Coordinator: {transfer.to_shift_coordinator_name}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="text-sm text-gray-700">
                <span className="font-medium">Reason:</span>{' '}
                <span>{transfer.reason}</span>
              </div>

              {/* Request details */}
              <div className="text-xs text-gray-500 space-y-1">
                <div>
                  <span className="font-medium text-gray-600">Requested:</span>{' '}
                  <span>
                    {new Date(transfer.requested_date).toLocaleDateString()}
                  </span>
                </div>
                {transfer.requesting_teacher_name && (
                  <div>
                    <span className="font-medium text-gray-600">By:</span>{' '}
                    <span>{transfer.requesting_teacher_name}</span>
                  </div>
                )}
              </div>

              {/* Footer: status + actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 pt-1 sm:pt-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(transfer.status)}
                  {transfer.decline_reason && (
                    <Badge variant="outline" className="text-red-600 text-[10px] sm:text-xs">
                      {transfer.decline_reason}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {isCoordinator &&
                    (transfer.status === 'pending_own_coord' ||
                      transfer.status === 'pending_other_coord') && (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={async () => {
                            try {
                              setActionLoading(transfer.id);
                              if (transfer.status === 'pending_own_coord') {
                                await approveShiftTransferOwn(transfer.id);
                              } else {
                                await approveShiftTransferOther(transfer.id);
                              }
                              toast.success('Shift transfer approved');
                              await loadTeacherCoordinatorTransfers();
                            } catch (error: any) {
                              console.error(
                                'Error approving shift transfer:',
                                error,
                              );
                              toast.error(
                                error.message || 'Failed to approve shift transfer',
                              );
                            } finally {
                              setActionLoading(null);
                            }
                          }}
                          disabled={actionLoading === transfer.id}
                          className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                        >
                          {actionLoading === transfer.id ? 'Approving...' : 'Approve'}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setSelectedShiftTransfer(transfer);
                            setDeclineReason('');
                            setShowDeclineDialog(true);
                          }}
                          disabled={actionLoading === transfer.id}
                          className="text-xs sm:text-sm"
                        >
                          Decline
                        </Button>
                      </>
                    )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderGradeSkipTransferCard = (transfer: GradeSkipTransfer) => {
    const isExpanded = expandedGradeSkipId === transfer.id;

    const fromText = `${transfer.from_grade_name || 'Current grade'}${transfer.from_section ? ` (${transfer.from_section})` : ''}`;
    const toText = `${transfer.to_grade_name || 'Target grade'}${transfer.to_section ? ` (${transfer.to_section})` : ''}`;

    return (
      <Card
        key={transfer.id}
        className="hover:shadow-md transition-shadow border border-gray-100 rounded-lg sm:rounded-xl md:rounded-2xl bg-white/80"
      >
        <CardContent className="p-2.5 sm:p-3 md:p-4 lg:p-5">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() =>
                setExpandedGradeSkipId(prev => (prev === transfer.id ? null : transfer.id))
              }
              className="flex-1 flex items-center justify-between gap-2 sm:gap-3 text-left"
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <GraduationCap className="h-4 w-4 sm:h-4 md:h-5 md:w-5 text-purple-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-xs sm:text-sm md:text-base text-gray-900 truncate">
                    {transfer.student_name}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-gray-500 truncate">
                    {transfer.student_id}
                    {transfer.initiated_by_teacher_name
                      ? ` · ${transfer.initiated_by_teacher_name}`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <div className="hidden sm:block">{getStatusBadge(transfer.status)}</div>
                <ChevronDown
                  className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
          </div>

          {/* Expanded details */}
          {isExpanded && (
            <div className="mt-2 sm:mt-3 border-t border-purple-100 pt-2 sm:pt-3 space-y-2 sm:space-y-3 text-xs sm:text-sm md:text-base">
              {/* From / To summary */}
              <div className="rounded-lg sm:rounded-xl border border-purple-100 bg-purple-50/70 px-2.5 sm:px-3 py-2 text-purple-900">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                  <GraduationCap className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4" />
                  <span className="font-semibold text-[10px] sm:text-xs">Grade Skip</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div className="space-y-0.5">
                    <p className="text-[11px] uppercase tracking-wide text-purple-700 font-semibold">
                      From
                    </p>
                    <p className="font-semibold">{fromText}</p>
                    {transfer.from_shift && (
                      <p className="text-[11px] text-purple-800">
                        Shift: {transfer.from_shift}
                      </p>
                    )}
                    {transfer.from_grade_coordinator_name && (
                      <p className="text-[11px] text-purple-800">
                        Coordinator: {transfer.from_grade_coordinator_name}
                      </p>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] uppercase tracking-wide text-purple-700 font-semibold">
                      To
                    </p>
                    <p className="font-semibold">{toText}</p>
                    {transfer.to_shift && (
                      <p className="text-[11px] text-purple-800">
                        Shift: {transfer.to_shift}
                      </p>
                    )}
                    {transfer.to_grade_coordinator_name && (
                      <p className="text-[11px] text-purple-800">
                        Coordinator: {transfer.to_grade_coordinator_name}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="text-sm text-gray-700">
                <span className="font-medium">Reason:</span>{' '}
                <span>{transfer.reason}</span>
              </div>

              {/* Request details */}
              <div className="text-xs text-gray-500 space-y-1">
                <div>
                  <span className="font-medium text-gray-600">Requested:</span>{' '}
                  <span>
                    {new Date(transfer.requested_date).toLocaleDateString()}
                  </span>
                </div>
                {transfer.initiated_by_teacher_name && (
                  <div>
                    <span className="font-medium text-gray-600">By:</span>{' '}
                    <span>{transfer.initiated_by_teacher_name}</span>
                  </div>
                )}
              </div>

              {/* Footer: status + actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 pt-1 sm:pt-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(transfer.status)}
                  {transfer.decline_reason && (
                    <Badge variant="outline" className="text-red-600 text-[10px] sm:text-xs">
                      {transfer.decline_reason}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {isCoordinator &&
                    (transfer.status === 'pending_own_coord' ||
                      transfer.status === 'pending_other_coord') && (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={async () => {
                            try {
                              setActionLoading(transfer.id);
                              if (transfer.status === 'pending_own_coord') {
                                await approveGradeSkipOwnCoord(transfer.id);
                              } else {
                                await approveGradeSkipOtherCoord(transfer.id);
                              }
                              toast.success('Grade skip transfer approved');
                              await loadTeacherCoordinatorTransfers();
                            } catch (error: any) {
                              console.error(
                                'Error approving grade skip transfer:',
                                error,
                              );
                              toast.error(
                                error.message || 'Failed to approve grade skip transfer',
                              );
                            } finally {
                              setActionLoading(null);
                            }
                          }}
                          disabled={actionLoading === transfer.id}
                          className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                        >
                          {actionLoading === transfer.id ? 'Approving...' : 'Approve'}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setSelectedGradeSkipTransfer(transfer);
                            setDeclineReason('');
                            setShowDeclineDialog(true);
                          }}
                          disabled={actionLoading === transfer.id}
                          className="text-xs sm:text-sm"
                        >
                          Decline
                        </Button>
                      </>
                    )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Teacher / Coordinator view: only class + shift transfers
    if (loading) {
      return (
        <div className="min-h-[60vh] bg-gray-50 p-6 pb-8">
          <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-9 w-24 rounded-full bg-gray-200" />
                <div className="space-y-2">
                  <div className="h-5 w-40 bg-gray-200 rounded" />
                  <div className="h-4 w-64 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="h-9 w-32 bg-blue-100/60 rounded-full" />
            </div>

            {/* Tabs skeleton */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex gap-2 mb-4">
                <div className="h-9 flex-1 bg-gray-100 rounded-full" />
                <div className="h-9 flex-1 bg-gray-50 rounded-full" />
              </div>
              <div className="grid gap-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-start gap-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-40 bg-gray-200 rounded" />
                      <div className="h-3 w-56 bg-gray-100 rounded" />
                      <div className="h-3 w-32 bg-gray-100 rounded" />
                    </div>
                    <div className="w-16 h-7 bg-gray-100 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Separate class transfers into incoming and outgoing
    const classIncoming = classTransfers.filter(t => {
      // Incoming: coordinator needs to approve (not created by current teacher)
      const isOutgoing = currentTeacherId && t.initiated_by_teacher === currentTeacherId;
      return !isOutgoing && (currentCoordinatorId ? t.coordinator === currentCoordinatorId : t.status === 'pending');
    });
    
    const classOutgoing = classTransfers.filter(t => {
      // Outgoing: created by current teacher
      return currentTeacherId && t.initiated_by_teacher === currentTeacherId;
    });

    // Filter by status and direction
    const filteredClassTransfers = (classDirectionFilter === 'incoming' ? classIncoming : classOutgoing).filter(
      t => classStatusFilter === 'pending' ? t.status === 'pending' : t.status !== 'pending'
    );

    // Separate shift transfers into incoming and outgoing
    const shiftIncoming = shiftTransfers.filter(t => {
      // Incoming: coordinator needs to approve (not created by current teacher)
      const isOutgoing = currentTeacherId && t.requesting_teacher === currentTeacherId;
      if (isOutgoing) return false;
      // Check if current coordinator is from_shift_coordinator or to_shift_coordinator
      if (currentCoordinatorId) {
        return t.from_shift_coordinator === currentCoordinatorId || t.to_shift_coordinator === currentCoordinatorId;
      }
      // If no coordinator ID, show pending ones
      return t.status === 'pending_own_coord' || t.status === 'pending_other_coord';
    });
    
    const shiftOutgoing = shiftTransfers.filter(t => {
      // Outgoing: created by current teacher
      return currentTeacherId && t.requesting_teacher === currentTeacherId;
    });

    // Filter by status and direction
    const filteredShiftTransfers = (shiftDirectionFilter === 'incoming' ? shiftIncoming : shiftOutgoing).filter(
      t => shiftStatusFilter === 'pending' 
        ? (t.status === 'pending_own_coord' || t.status === 'pending_other_coord')
        : (t.status !== 'pending_own_coord' && t.status !== 'pending_other_coord')
    );

    // Separate grade skip transfers into incoming and outgoing
    const gradeSkipIncoming = gradeSkipTransfers.filter(t => {
      // Incoming: coordinator needs to approve (not created by current teacher)
      const isOutgoing = currentTeacherId && t.initiated_by_teacher === currentTeacherId;
      if (isOutgoing) return false;
      // Check if current coordinator is from_grade_coordinator or to_grade_coordinator
      if (currentCoordinatorId) {
        return t.from_grade_coordinator === currentCoordinatorId || t.to_grade_coordinator === currentCoordinatorId;
      }
      // If no coordinator ID, show pending ones
      return t.status === 'pending_own_coord' || t.status === 'pending_other_coord';
    });
    
    const gradeSkipOutgoing = gradeSkipTransfers.filter(t => {
      // Outgoing: created by current teacher
      return currentTeacherId && t.initiated_by_teacher === currentTeacherId;
    });

    // Filter by status and direction
    const filteredGradeSkipTransfers = (gradeSkipDirectionFilter === 'incoming' ? gradeSkipIncoming : gradeSkipOutgoing).filter(
      t => gradeSkipStatusFilter === 'pending' 
        ? (t.status === 'pending_own_coord' || t.status === 'pending_other_coord')
        : (t.status !== 'pending_own_coord' && t.status !== 'pending_other_coord')
    );

  // Campus transfers - filter by direction
  console.log('🔍 Campus Transfers Filtering:', {
    totalTransfers: campusTransfers.length,
    currentCoordinatorId,
    currentTeacherId,
    allTransfers: campusTransfers.map(t => ({
      id: t.id,
      from_coordinator: t.from_coordinator,
      to_coordinator: t.to_coordinator,
      initiated_by_teacher: t.initiated_by_teacher,
      status: t.status
    }))
  });

  const campusIncoming = campusTransfers.filter(t => {
    // Incoming: where current user is receiving/approving
    if (isPrincipal && currentUserId) {
      // Principal: show transfers where they need to approve (from_principal or to_principal)
      // For incoming, show transfers where this principal needs to act
      const match = t.from_principal === currentUserId || t.to_principal === currentUserId;
      console.log(`Principal Transfer ${t.id}: from_principal=${t.from_principal}, to_principal=${t.to_principal}, currentUser=${currentUserId}, match=${match}`);
      return match;
    } else if (currentCoordinatorId) {
      const match = t.from_coordinator === currentCoordinatorId || t.to_coordinator === currentCoordinatorId;
      console.log(`Coordinator Transfer ${t.id}: from_coord=${t.from_coordinator}, to_coord=${t.to_coordinator}, current=${currentCoordinatorId}, match=${match}`);
      return match;
    }
    return false;
  });

  const campusOutgoing = campusTransfers.filter(t => {
    // Outgoing: where current user initiated
    if (isPrincipal && currentUserId) {
      // For principal, outgoing means from their campus
      return t.from_principal === currentUserId;
    } else if (currentTeacherId) {
      return t.initiated_by_teacher === currentTeacherId;
    }
    return false;
  });

  const filteredCampusTransfers = (campusDirectionFilter === 'incoming' ? campusIncoming : campusOutgoing).filter(
    t =>
      campusStatusFilter === 'pending'
        ? t.status !== 'approved' && t.status !== 'declined' && t.status !== 'cancelled'
        : t.status === 'approved' || t.status === 'declined' || t.status === 'cancelled',
  );

    // Calculate counts for current direction
    const pendingClassCount = (classDirectionFilter === 'incoming' ? classIncoming : classOutgoing).filter(
      t => t.status === 'pending'
    ).length;
    const historyClassCount = (classDirectionFilter === 'incoming' ? classIncoming : classOutgoing).filter(
      t => t.status !== 'pending'
    ).length;

    const pendingShiftCount = (shiftDirectionFilter === 'incoming' ? shiftIncoming : shiftOutgoing).filter(
      t => t.status === 'pending_own_coord' || t.status === 'pending_other_coord'
    ).length;
    const historyShiftCount = (shiftDirectionFilter === 'incoming' ? shiftIncoming : shiftOutgoing).filter(
      t => t.status !== 'pending_own_coord' && t.status !== 'pending_other_coord'
    ).length;

  const pendingCampusCount = (campusDirectionFilter === 'incoming' ? campusIncoming : campusOutgoing).filter(
    t => t.status !== 'approved' && t.status !== 'declined' && t.status !== 'cancelled',
  ).length;
  const historyCampusCount = (campusDirectionFilter === 'incoming' ? campusIncoming : campusOutgoing).filter(
    t => t.status === 'approved' || t.status === 'declined' || t.status === 'cancelled',
  ).length;

  // All users view (4 tabs: Class, Shift, Grade Skip, Campus)
    return (
    <div className="bg-gray-50 p-2 sm:p-4 md:p-6 pb-4 sm:pb-6 md:pb-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.back()}
              className="flex items-center gap-2 w-full sm:w-auto"
              >
                <ArrowLeft className="h-4 w-4" />
              <span className="sm:hidden">Go Back</span>
              <span className="hidden sm:inline">Back</span>
              </Button>
            <div className="flex-1 sm:flex-none">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">Transfer Management</h1>
              <p className="text-xs sm:text-sm md:text-base text-gray-600">
                  View and manage class and shift transfer requests
                </p>
              </div>
            </div>
          {!isPrincipal && (
            <Button
              onClick={() => router.push('/admin/principals/transfers/create')}
              className="flex items-center gap-2 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              <span className="sm:hidden">Create</span>
              <span className="hidden sm:inline">Create Transfer Request</span>
            </Button>
          )}
          </div>

        <Tabs defaultValue="class" className="space-y-4 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-4 h-auto">
            <TabsTrigger value="class" className="text-xs sm:text-sm md:text-base py-2 sm:py-2.5">
              <span className="hidden sm:inline">Class Transfers</span>
              <span className="sm:hidden">Class</span>
              </TabsTrigger>
            <TabsTrigger value="shift" className="text-xs sm:text-sm md:text-base py-2 sm:py-2.5">
              <span className="hidden sm:inline">Shift Transfers</span>
              <span className="sm:hidden">Shift</span>
              </TabsTrigger>
            <TabsTrigger value="grade-skip" className="text-xs sm:text-sm md:text-base py-2 sm:py-2.5">
              <span className="hidden sm:inline">Grade Skip</span>
              <span className="sm:hidden">Skip</span>
            </TabsTrigger>
            <TabsTrigger value="campus" className="text-xs sm:text-sm md:text-base py-2 sm:py-2.5">
              <span className="hidden sm:inline">Campus Transfers</span>
              <span className="sm:hidden">Campus</span>
              </TabsTrigger>
            </TabsList>

          <TabsContent value="class" className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
              <h2 className="text-xs sm:text-sm md:text-base font-semibold text-gray-700">Class Transfers</h2>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  {/* Incoming/Outgoing Tabs */}
                <div className="inline-flex rounded-full bg-gray-100 p-0.5 sm:p-1 text-[10px] sm:text-xs">
                    <button
                      type="button"
                      onClick={() => setClassDirectionFilter('incoming')}
                    className={`px-2 sm:px-3 py-1 rounded-full transition text-[10px] sm:text-xs ${classDirectionFilter === 'incoming'
                          ? 'bg-white shadow-sm text-blue-600 font-medium'
                          : 'text-gray-500'
                      }`}
                    >
                      Incoming
                    </button>
                    <button
                      type="button"
                      onClick={() => setClassDirectionFilter('outgoing')}
                    className={`px-2 sm:px-3 py-1 rounded-full transition text-[10px] sm:text-xs ${classDirectionFilter === 'outgoing'
                          ? 'bg-white shadow-sm text-blue-600 font-medium'
                          : 'text-gray-500'
                      }`}
                    >
                      Outgoing
                    </button>
                  </div>
                  {/* Pending/History Filter */}
                <div className="inline-flex rounded-full bg-gray-100 p-0.5 sm:p-1 text-[10px] sm:text-xs">
                    <button
                      type="button"
                      onClick={() => setClassStatusFilter('pending')}
                    className={`px-2 sm:px-3 py-1 rounded-full transition text-[10px] sm:text-xs ${classStatusFilter === 'pending'
                          ? 'bg-white shadow-sm text-blue-600'
                          : 'text-gray-500'
                      }`}
                    >
                      Pending ({pendingClassCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setClassStatusFilter('history')}
                    className={`px-2 sm:px-3 py-1 rounded-full transition text-[10px] sm:text-xs ${classStatusFilter === 'history'
                          ? 'bg-white shadow-sm text-blue-600'
                          : 'text-gray-500'
                      }`}
                    >
                      History ({historyClassCount})
                    </button>
                  </div>
                </div>
              </div>
              {filteredClassTransfers.length === 0 ? (
                <Card className="border-dashed border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                <CardContent className="py-6 sm:py-8 md:py-10 px-4 sm:px-6 text-center flex flex-col items-center justify-center gap-2 sm:gap-3">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-blue-50 flex items-center justify-center mb-1">
                    <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />
                    </div>
                  <p className="text-sm sm:text-base font-semibold text-gray-800 px-2">
                      {classStatusFilter === 'pending'
                        ? `No pending ${classDirectionFilter} class transfers`
                        : `No ${classDirectionFilter} class transfer history yet`}
                    </p>
                  <p className="text-[11px] sm:text-xs text-gray-500 max-w-md px-2 break-words">
                      {classStatusFilter === 'pending'
                        ? classDirectionFilter === 'incoming'
                          ? 'There are currently no class/section transfer requests waiting for your approval.'
                          : 'You have not created any pending class transfer requests.'
                        : classDirectionFilter === 'incoming'
                          ? 'When transfers are approved or declined, they will appear here for your reference.'
                          : 'Your approved or declined transfer requests will appear here.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {filteredClassTransfers.map(transfer => renderClassTransferCard(transfer))}
                </div>
              )}
            </TabsContent>

          <TabsContent value="shift" className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
              <h2 className="text-xs sm:text-sm md:text-base font-semibold text-gray-700">Shift Transfers</h2>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  {/* Incoming/Outgoing Tabs */}
                <div className="inline-flex rounded-full bg-gray-100 p-0.5 sm:p-1 text-[10px] sm:text-xs">
                    <button
                      type="button"
                      onClick={() => setShiftDirectionFilter('incoming')}
                    className={`px-2 sm:px-3 py-1 rounded-full transition text-[10px] sm:text-xs ${shiftDirectionFilter === 'incoming'
                          ? 'bg-white shadow-sm text-blue-600 font-medium'
                          : 'text-gray-500'
                      }`}
                    >
                      Incoming
                    </button>
                    <button
                      type="button"
                      onClick={() => setShiftDirectionFilter('outgoing')}
                    className={`px-2 sm:px-3 py-1 rounded-full transition text-[10px] sm:text-xs ${shiftDirectionFilter === 'outgoing'
                          ? 'bg-white shadow-sm text-blue-600 font-medium'
                          : 'text-gray-500'
                      }`}
                    >
                      Outgoing
                    </button>
                  </div>
                  {/* Pending/History Filter */}
                <div className="inline-flex rounded-full bg-gray-100 p-0.5 sm:p-1 text-[10px] sm:text-xs">
                    <button
                      type="button"
                      onClick={() => setShiftStatusFilter('pending')}
                    className={`px-2 sm:px-3 py-1 rounded-full transition text-[10px] sm:text-xs ${shiftStatusFilter === 'pending'
                          ? 'bg-white shadow-sm text-blue-600'
                          : 'text-gray-500'
                      }`}
                    >
                      Pending ({pendingShiftCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setShiftStatusFilter('history')}
                    className={`px-2 sm:px-3 py-1 rounded-full transition text-[10px] sm:text-xs ${shiftStatusFilter === 'history'
                          ? 'bg-white shadow-sm text-blue-600'
                          : 'text-gray-500'
                      }`}
                    >
                      History ({historyShiftCount})
                    </button>
                  </div>
                </div>
              </div>
              {filteredShiftTransfers.length === 0 ? (
                <Card className="border-dashed border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                <CardContent className="py-6 sm:py-8 md:py-10 px-4 sm:px-6 text-center flex flex-col items-center justify-center gap-2 sm:gap-3">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-indigo-50 flex items-center justify-center mb-1">
                    <ArrowRightLeft className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-500" />
                    </div>
                  <p className="text-sm sm:text-base font-semibold text-gray-800 px-2">
                      {shiftStatusFilter === 'pending'
                        ? `No pending ${shiftDirectionFilter} shift transfers`
                        : `No ${shiftDirectionFilter} shift transfer history yet`}
                    </p>
                  <p className="text-[11px] sm:text-xs text-gray-500 max-w-md px-2 break-words">
                      {shiftStatusFilter === 'pending'
                        ? shiftDirectionFilter === 'incoming'
                          ? 'There are currently no shift transfer requests waiting for your approval.'
                          : 'You have not created any pending shift transfer requests.'
                        : shiftDirectionFilter === 'incoming'
                          ? 'Approved or declined shift transfers will be listed here for your records.'
                          : 'Your approved or declined shift transfer requests will appear here.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {filteredShiftTransfers.map(transfer => renderShiftTransferCard(transfer))}
                </div>
              )}
            </TabsContent>

          <TabsContent value="grade-skip" className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
              <h2 className="text-xs sm:text-sm md:text-base font-semibold text-gray-700">Grade Skip Transfers</h2>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  {/* Incoming/Outgoing Tabs */}
                <div className="inline-flex rounded-full bg-gray-100 p-0.5 sm:p-1 text-[10px] sm:text-xs">
                    <button
                      type="button"
                      onClick={() => setGradeSkipDirectionFilter('incoming')}
                    className={`px-2 sm:px-3 py-1 rounded-full transition text-[10px] sm:text-xs ${gradeSkipDirectionFilter === 'incoming'
                          ? 'bg-purple-600 text-white font-semibold'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Incoming
                    </button>
                    <button
                      type="button"
                      onClick={() => setGradeSkipDirectionFilter('outgoing')}
                    className={`px-2 sm:px-3 py-1 rounded-full transition text-[10px] sm:text-xs ${gradeSkipDirectionFilter === 'outgoing'
                          ? 'bg-purple-600 text-white font-semibold'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Outgoing
                    </button>
                  </div>
                  {/* Pending/History Tabs */}
                <div className="inline-flex rounded-full bg-gray-100 p-0.5 sm:p-1 text-[10px] sm:text-xs">
                    <button
                      type="button"
                      onClick={() => setGradeSkipStatusFilter('pending')}
                    className={`px-2 sm:px-3 py-1 rounded-full transition text-[10px] sm:text-xs ${gradeSkipStatusFilter === 'pending'
                          ? 'bg-purple-600 text-white font-semibold'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Pending
                    </button>
                    <button
                      type="button"
                      onClick={() => setGradeSkipStatusFilter('history')}
                    className={`px-2 sm:px-3 py-1 rounded-full transition text-[10px] sm:text-xs ${gradeSkipStatusFilter === 'history'
                          ? 'bg-purple-600 text-white font-semibold'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      History
                    </button>
                  </div>
                </div>
              </div>
              {filteredGradeSkipTransfers.length === 0 ? (
                <Card className="border-dashed border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                <CardContent className="py-6 sm:py-8 md:py-10 px-4 sm:px-6 text-center flex flex-col items-center justify-center gap-2 sm:gap-3">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-purple-50 flex items-center justify-center mb-1">
                    <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-purple-500" />
                    </div>
                  <p className="text-sm sm:text-base font-semibold text-gray-800 px-2">
                      {gradeSkipStatusFilter === 'pending'
                        ? `No pending ${gradeSkipDirectionFilter} grade skip transfers`
                        : `No ${gradeSkipDirectionFilter} grade skip transfer history yet`}
                    </p>
                  <p className="text-[11px] sm:text-xs text-gray-500 max-w-md px-2 break-words">
                      {gradeSkipStatusFilter === 'pending'
                        ? gradeSkipDirectionFilter === 'incoming'
                          ? 'There are currently no grade skip transfer requests waiting for your approval.'
                          : 'You have not created any pending grade skip transfer requests.'
                        : gradeSkipDirectionFilter === 'incoming'
                          ? 'Approved or declined grade skip transfers will be listed here for your records.'
                          : 'Your approved or declined grade skip transfer requests will appear here.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {filteredGradeSkipTransfers.map(transfer => renderGradeSkipTransferCard(transfer))}
                </div>
              )}
            </TabsContent>

          <TabsContent value="campus" className="space-y-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Campus Transfers</h2>
              <div className="flex items-center gap-3">
                {/* Incoming/Outgoing Tabs */}
                <div className="inline-flex rounded-full bg-gray-100 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setCampusDirectionFilter('incoming')}
                    className={`px-3 py-1 rounded-full transition ${campusDirectionFilter === 'incoming'
                      ? 'bg-white shadow-sm text-blue-600 font-medium'
                      : 'text-gray-500'
                      }`}
                  >
                    Incoming
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampusDirectionFilter('outgoing')}
                    className={`px-3 py-1 rounded-full transition ${campusDirectionFilter === 'outgoing'
                      ? 'bg-white shadow-sm text-blue-600 font-medium'
                      : 'text-gray-500'
                      }`}
                  >
                    Outgoing
                  </button>
                </div>
                {/* Pending/History Tabs */}
                <div className="inline-flex rounded-full bg-gray-100 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setCampusStatusFilter('pending')}
                    className={`px-3 py-1 rounded-full transition ${campusStatusFilter === 'pending'
                      ? 'bg-white shadow-sm text-blue-600'
                      : 'text-gray-500'
                      }`}
                  >
                    Pending ({pendingCampusCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampusStatusFilter('history')}
                    className={`px-3 py-1 rounded-full transition ${campusStatusFilter === 'history'
                      ? 'bg-white shadow-sm text-blue-600'
                      : 'text-gray-500'
                      }`}
                  >
                    History ({historyCampusCount})
                  </button>
                </div>
              </div>
            </div>
            {filteredCampusTransfers.length === 0 ? (
              <Card className="border-dashed border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                <CardContent className="py-10 px-6 text-center flex flex-col items-center justify-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center mb-1">
                    <Building className="h-6 w-6 text-blue-500" />
                  </div>
                  <p className="text-base font-semibold text-gray-800">
                    {campusStatusFilter === 'pending'
                      ? `No pending ${campusDirectionFilter} campus transfers`
                      : `No ${campusDirectionFilter} campus transfer history yet`}
                  </p>
                  <p className="text-xs text-gray-500 max-w-md">
                    {campusStatusFilter === 'pending'
                      ? campusDirectionFilter === 'incoming'
                        ? 'There are currently no campus transfer requests waiting for your approval.'
                        : 'You have not created any pending campus transfer requests.'
                      : campusDirectionFilter === 'incoming'
                        ? 'Approved or declined campus transfers will be listed here for your records.'
                        : 'Your approved or declined campus transfer requests will appear here.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {filteredCampusTransfers.map(transfer => (
                  <Card
                    key={transfer.id}
                    className="hover:shadow-md transition-shadow border border-gray-100 rounded-2xl bg-white/80"
                  >
                    <CardContent className="p-4 md:p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() =>
                            setExpandedCampusId(prev => (prev === transfer.id ? null : transfer.id))
                          }
                          className="flex-1 flex items-center justify-between gap-3 text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <GraduationCap className="h-4 w-4 md:h-5 md:w-5 text-blue-600 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-sm md:text-base text-gray-900 truncate">
                                {transfer.student_name}
                              </h3>
                              <p className="text-xs text-gray-500 truncate">
                                {transfer.student_id}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="hidden sm:block">{getStatusBadge(transfer.status)}</div>
                            <ChevronDown
                              className={`h-4 w-4 text-gray-400 transition-transform ${expandedCampusId === transfer.id ? 'rotate-180' : ''
                                }`}
                            />
                          </div>
                        </button>
                      </div>

                      {/* Expanded Details */}
                      <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${expandedCampusId === transfer.id
                          ? 'max-h-[2000px] opacity-100'
                          : 'max-h-0 opacity-0'
                          }`}
                      >
                        <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                          {/* Transfer Details */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold text-gray-700 uppercase">From</h4>
                              <div className="space-y-2">
                                <div>
                                  <Label className="text-xs text-gray-500">Campus</Label>
                                  <p className="text-sm font-medium">{transfer.from_campus_name}</p>
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-500">Grade / Section</Label>
                                  <p className="text-sm font-medium">
                                    {transfer.from_grade_name} {transfer.from_section ? `(${transfer.from_section})` : ''}
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-500">Shift</Label>
                                  <p className="text-sm font-medium capitalize">{transfer.from_shift}</p>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold text-gray-700 uppercase">To</h4>
                              <div className="space-y-2">
                                <div>
                                  <Label className="text-xs text-gray-500">Campus</Label>
                                  <p className="text-sm font-medium">{transfer.to_campus_name}</p>
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-500">Grade / Section</Label>
                                  <p className="text-sm font-medium">
                                    {transfer.to_grade_name} {transfer.to_section ? `(${transfer.to_section})` : ''}
                                    {transfer.skip_grade && (
                                      <Badge variant="outline" className="ml-2 text-xs">Grade Skip</Badge>
                                    )}
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-500">Shift</Label>
                                  <p className="text-sm font-medium capitalize">{transfer.to_shift || transfer.from_shift}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Reason */}
                          <div>
                            <Label className="text-xs text-gray-500">Reason</Label>
                            <p className="text-sm mt-1">{transfer.reason}</p>
                          </div>

                          {/* Requested Date */}
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <Calendar className="h-3 w-3" />
                            <span>Requested: {new Date(transfer.requested_date).toLocaleDateString()}</span>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2 pt-2">
                            {/* Teacher: Can only cancel if pending_from_coord */}
                            {isTeacher && transfer.status === 'pending_from_coord' && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={async () => {
                                  if (!confirm('Are you sure you want to cancel this campus transfer request?')) return;
                                  try {
                                    setActionLoading(transfer.id);
                                    await cancelCampusTransfer(transfer.id);
                                    toast.success('Campus transfer cancelled successfully');
                                    await loadTeacherCoordinatorTransfers();
                                  } catch (error: any) {
                                    console.error('Error cancelling campus transfer:', error);
                                    toast.error(error.message || 'Failed to cancel campus transfer');
                                  } finally {
                                    setActionLoading(null);
                                  }
                                }}
                                disabled={actionLoading === transfer.id}
                                className="text-xs sm:text-sm"
                              >
                                {actionLoading === transfer.id ? 'Cancelling...' : 'Cancel Request'}
                              </Button>
                            )}

                            {/* Coordinator: Approve/Decline based on status */}
                            {isCoordinator && (
                              <>
                                {transfer.status === 'pending_from_coord' && (
                                  <>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={async () => {
                                        try {
                                          setActionLoading(transfer.id);
                                          await approveCampusTransferFromCoord(transfer.id);
                                          toast.success('Campus transfer approved and forwarded to from-campus principal');
                                          await loadTeacherCoordinatorTransfers();
                                        } catch (error: any) {
                                          console.error('Error approving campus transfer:', error);
                                          toast.error(error.message || 'Failed to approve campus transfer');
                                        } finally {
                                          setActionLoading(null);
                                        }
                                      }}
                                      disabled={actionLoading === transfer.id}
                                      className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                                    >
                                      {actionLoading === transfer.id ? 'Approving...' : 'Approve'}
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedCampusTransfer(transfer);
                                        setDeclineReason('');
                                        setShowDeclineDialog(true);
                                      }}
                                      disabled={actionLoading === transfer.id}
                                      className="text-xs sm:text-sm"
                                    >
                                      Decline
                                    </Button>
                                  </>
                                )}

                                {transfer.status === 'pending_to_coord' && (
                                  <>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedCampusTransfer(transfer);
                                        setShowCampusConfirmDialog(true);
                                        setCampusConfirmText('');
                                      }}
                                      disabled={actionLoading === transfer.id}
                                      className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                                    >
                                      {actionLoading === transfer.id ? 'Confirming...' : 'Confirm Transfer'}
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedCampusTransfer(transfer);
                                        setDeclineReason('');
                                        setShowDeclineDialog(true);
                                      }}
                                      disabled={actionLoading === transfer.id}
                                      className="text-xs sm:text-sm"
                                    >
                                      Decline
                                    </Button>
                                  </>
                                )}
                              </>
                            )}

                            {/* Principal: Approve/Decline based on status */}
                            {isPrincipal && (
                              <>
                                {transfer.status === 'pending_from_principal' && (
                                  <>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={async () => {
                                        try {
                                          setActionLoading(transfer.id);
                                          await approveCampusTransferFromPrincipal(transfer.id);
                                          toast.success('Campus transfer approved and forwarded to destination campus principal');
                                          await loadTeacherCoordinatorTransfers();
                                        } catch (error: any) {
                                          console.error('Error approving campus transfer:', error);
                                          toast.error(error.message || 'Failed to approve campus transfer');
                                        } finally {
                                          setActionLoading(null);
                                        }
                                      }}
                                      disabled={actionLoading === transfer.id}
                                      className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                                    >
                                      {actionLoading === transfer.id ? 'Approving...' : 'Approve'}
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedCampusTransfer(transfer);
                                        setDeclineReason('');
                                        setShowDeclineDialog(true);
                                      }}
                                      disabled={actionLoading === transfer.id}
                                      className="text-xs sm:text-sm"
                                    >
                                      Decline
                                    </Button>
                                  </>
                                )}

                                {transfer.status === 'pending_to_principal' && (
                                  <>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={async () => {
                                        try {
                                          setActionLoading(transfer.id);
                                          await approveCampusTransferToPrincipal(transfer.id);
                                          toast.success('Campus transfer approved and forwarded to destination coordinator');
                                          await loadTeacherCoordinatorTransfers();
                                        } catch (error: any) {
                                          console.error('Error approving campus transfer:', error);
                                          toast.error(error.message || 'Failed to approve campus transfer');
                                        } finally {
                                          setActionLoading(null);
                                        }
                                      }}
                                      disabled={actionLoading === transfer.id}
                                      className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                                    >
                                      {actionLoading === transfer.id ? 'Approving...' : 'Approve'}
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedCampusTransfer(transfer);
                                        setDeclineReason('');
                                        setShowDeclineDialog(true);
                                      }}
                                      disabled={actionLoading === transfer.id}
                                      className="text-xs sm:text-sm"
                                    >
                                      Decline
                                    </Button>
                                  </>
                                )}
                              </>
                            )}

                            {/* View Letter Button - For approved transfers */}
                            {transfer.status === 'approved' && (
                              <>
                                {/* Teacher who initiated: Can view letter */}
                                {isTeacher && currentTeacherId === transfer.initiated_by_teacher && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        setActionLoading(transfer.id);
                                        const letter = await getCampusTransferLetter(transfer.id);
                                        setCampusLetter(letter);
                                        setSelectedCampusTransfer(transfer);
                                        setShowCampusLetter(true);
                                      } catch (error: any) {
                                        console.error('Error fetching letter:', error);
                                        toast.error(error.message || 'Failed to fetch transfer letter');
                                      } finally {
                                        setActionLoading(null);
                                      }
                                    }}
                                    disabled={actionLoading === transfer.id}
                                    className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm"
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    {actionLoading === transfer.id ? 'Loading...' : 'View Letter'}
                                  </Button>
                                )}

                                {/* Others: View only */}
                                {((isPrincipal && currentUserId === transfer.from_principal) ||
                                  (isTeacher && currentTeacherId !== transfer.initiated_by_teacher)) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={async () => {
                                        try {
                                          setActionLoading(transfer.id);
                                          const letter = await getCampusTransferLetter(transfer.id);
                                          setCampusLetter(letter);
                                          setShowCampusLetter(true);
                                        } catch (error: any) {
                                          console.error('Error fetching letter:', error);
                                          toast.error(error.message || 'Failed to fetch transfer letter');
                                        } finally {
                                          setActionLoading(null);
                                        }
                                      }}
                                      disabled={actionLoading === transfer.id}
                                      className="text-xs sm:text-sm"
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      {actionLoading === transfer.id ? 'Loading...' : 'View Letter'}
                                    </Button>
                                  )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          </Tabs>

          {/* Shared Decline Dialog for class/shift/grade skip transfers (coordinator) */}
          <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
          <DialogContent className="w-[95vw] sm:w-full sm:max-w-lg">
              <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600 text-base sm:text-lg">
                <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                  Decline Transfer Request
                </DialogTitle>
              </DialogHeader>
            <div className="space-y-3 sm:space-y-4">
                <Alert>
                <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <AlertDescription className="text-xs sm:text-sm">
                    Are you sure you want to decline this transfer request? This action
                    cannot be undone.
                  </AlertDescription>
                </Alert>

                <div>
                <Label htmlFor="decline_reason" className="text-xs sm:text-sm">Reason for declining *</Label>
                  <Textarea
                    id="decline_reason"
                    placeholder="Please provide a reason for declining this transfer..."
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    rows={3}
                  className="mt-1 text-xs sm:text-sm"
                  />
                </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeclineDialog(false);
                      setDeclineReason('');
                      setSelectedClassTransfer(null);
                      setSelectedShiftTransfer(null);
                    setSelectedGradeSkipTransfer(null);
                    }}
                  className="w-full sm:w-auto text-xs sm:text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      if (!declineReason.trim()) {
                        toast.error('Please provide a reason for declining');
                        return;
                      }
                      try {
                        if (selectedClassTransfer) {
                          setActionLoading(selectedClassTransfer.id);
                          await declineClassTransfer(selectedClassTransfer.id, declineReason);
                          toast.success('Class transfer declined');
                          setSelectedClassTransfer(null);
                        } else if (selectedShiftTransfer) {
                          setActionLoading(selectedShiftTransfer.id);
                          await declineShiftTransfer(selectedShiftTransfer.id, declineReason);
                          toast.success('Shift transfer declined');
                          setSelectedShiftTransfer(null);
                        } else if (selectedGradeSkipTransfer) {
                          setActionLoading(selectedGradeSkipTransfer.id);
                          await declineGradeSkip(selectedGradeSkipTransfer.id, declineReason);
                          toast.success('Grade skip transfer declined');
                          setSelectedGradeSkipTransfer(null);
                      } else if (selectedCampusTransfer) {
                        setActionLoading(selectedCampusTransfer.id);
                        await declineCampusTransfer(selectedCampusTransfer.id, declineReason);
                        toast.success('Campus transfer declined');
                        setSelectedCampusTransfer(null);
                        }
                        setShowDeclineDialog(false);
                        setDeclineReason('');
                        await loadTeacherCoordinatorTransfers();
                      } catch (error: any) {
                        console.error('Error declining transfer:', error);
                        toast.error(error.message || 'Failed to decline transfer');
                      } finally {
                        setActionLoading(null);
                      }
                    }}
                    disabled={!declineReason.trim()}
                  className="w-full sm:w-auto text-xs sm:text-sm"
                  >
                    {actionLoading ? 'Declining...' : 'Decline Transfer'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

        {/* Campus Transfer Confirmation Dialog - GitHub Style */}
        <Dialog open={showCampusConfirmDialog} onOpenChange={setShowCampusConfirmDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <AlertCircle className="h-6 w-6 text-red-600" />
                Confirm Campus Transfer
              </DialogTitle>
            </DialogHeader>

            {selectedCampusTransfer && (
              <div className="space-y-6">
                {/* Warning Alert */}
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>This action cannot be undone.</strong> This will permanently transfer the student to the new campus and update their student ID.
                  </AlertDescription>
                </Alert>

                {/* Transfer Details */}
                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Student</p>
                      <p className="text-sm text-gray-900">{selectedCampusTransfer.student_name}</p>
        </div>
      </div>

                  <div className="flex items-start gap-2">
                    <Building className="h-4 w-4 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">From</p>
                      <p className="text-sm text-gray-900">
                        {selectedCampusTransfer.from_campus_name} - {selectedCampusTransfer.from_grade_name} ({selectedCampusTransfer.from_section})
                      </p>
              </div>
          </div>

                  <div className="flex items-start gap-2">
                    <ArrowRightLeft className="h-4 w-4 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">To</p>
                      <p className="text-sm text-gray-900">
                        {selectedCampusTransfer.to_campus_name} - {selectedCampusTransfer.to_grade_name} ({selectedCampusTransfer.to_section})
                      </p>
            </div>
                </div>
            </div>

                {/* Confirmation Input */}
                <div className="space-y-2">
                  <Label htmlFor="confirm-text" className="text-sm font-medium">
                    To confirm this campus transfer, please type <span className="font-mono font-bold text-red-600">confirm</span> below:
                  </Label>
                  <Input
                    id="confirm-text"
                    value={campusConfirmText}
                    onChange={(e) => setCampusConfirmText(e.target.value)}
                    placeholder="Type 'confirm' to proceed"
                    className="font-mono"
                    autoComplete="off"
                  />
          </div>

                {/* Action Buttons */}
                <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="outline"
                    onClick={() => {
                      setShowCampusConfirmDialog(false);
                      setCampusConfirmText('');
                      setSelectedCampusTransfer(null);
                    }}
                    disabled={actionLoading !== null}
                  >
                    Cancel
            </Button>
          <Button
                    variant="destructive"
                    onClick={async () => {
                      if (campusConfirmText.toLowerCase() !== 'confirm') {
                        toast.error('Please type "confirm" to proceed');
                        return;
                      }

                      try {
                        setActionLoading(selectedCampusTransfer.id);
                        await confirmCampusTransfer(selectedCampusTransfer.id, campusConfirmText);
                        toast.success('Campus transfer confirmed and applied successfully!');
                        setShowCampusConfirmDialog(false);
                        setCampusConfirmText('');
                        setSelectedCampusTransfer(null);
                        await loadTeacherCoordinatorTransfers();
                      } catch (error: any) {
                        console.error('Error confirming campus transfer:', error);
                        toast.error(error.message || 'Failed to confirm campus transfer');
                      } finally {
                        setActionLoading(null);
                      }
                    }}
                    disabled={actionLoading !== null || campusConfirmText.toLowerCase() !== 'confirm'}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {actionLoading === selectedCampusTransfer.id ? 'Confirming...' : 'Confirm Transfer'}
          </Button>
        </div>
              </div>
            )}
          </DialogContent>
        </Dialog>


        {/* Campus Transfer Letter Dialog - Professional Template */}
        <Dialog open={showCampusLetter} onOpenChange={setShowCampusLetter}>
          <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto bg-white">
            <DialogHeader className="sr-only">
              <DialogTitle>Campus Transfer Letter</DialogTitle>
            </DialogHeader>
            {campusLetter && (
              <div className="relative space-y-0 print:p-8" id="transfer-letter">
                {/* Watermark */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-5">
                  <div className="transform -rotate-45">
                    <p className="text-6xl font-bold text-gray-900 whitespace-nowrap">
                      Idara Al-Khair (IAK-SMS)
                    </p>
                    <p className="text-4xl font-semibold text-gray-900 text-center mt-2">
                      Powered By AIT
                    </p>
                  </div>
                    </div>
                {/* Letter Header - Sky Blue Theme with Logo */}
                <div className="bg-gradient-to-r from-sky-600 to-blue-600 text-white p-8 print:bg-sky-600 print:text-white">
                  {/* Diagonal Pattern Header */}
                  <div className="relative">
                    <div className="absolute top-0 left-0 w-full h-full opacity-10">
                      <div className="grid grid-cols-12 gap-1 h-full">
                        {[...Array(60)].map((_, i) => (
                          <div key={i} className="bg-white transform rotate-45"></div>
                        ))}
                  </div>
                </div>
                    <div className="relative flex items-center justify-between gap-6">
                      {/* Logo */}
                      <div className="shrink-0">
                        <div className="w-20 h-20 bg-white rounded-full p-2 shadow-lg">
                          <img
                            src="/logo.png"
                            alt="Idara Al-Khair Logo"
                            className="w-full h-full object-contain"
                          />
                        </div>
                </div>
                
                      {/* School Info */}
                      <div className="flex-1">
                        <h1 className="text-2xl font-bold mb-1">Idara Al-Khair</h1>
                        <p className="text-xs text-sky-100">Welfare Society</p>
                        <p className="text-xs text-sky-200 mt-1">info@idaraalkhair.com</p>
                  </div>
                    </div>
                  </div>
                </div>
                
                {/* Letter Title */}
                <div className="bg-white px-8 pt-4 pb-3 border-b-2 border-sky-200">
                  <h2 className="text-xl font-bold text-center bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                    Approval of Transfer Letter
                  </h2>
                </div>
                
                {/* Letter Body - Professional Format */}
                <div className="px-8 py-4 space-y-4 text-gray-800 text-sm leading-relaxed">
                  {/* Date and Reference */}
                  <div className="flex justify-between text-xs border-b pb-3">
                  <div>
                      <p className="font-semibold">Date:</p>
                      <p>{new Date(campusLetter.approved_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}</p>
                  </div>
                    <div className="text-right">
                      <p className="font-semibold">Student ID:</p>
                      <p className="font-mono">{campusLetter.student_old_id}</p>
                    </div>
                  </div>

                  {/* Student Details Box */}
                  <div className="bg-sky-50 border-l-4 border-sky-600 p-3">
                    <p className="font-semibold text-xs text-sky-700 mb-2">STUDENT DETAILS</p>
                    <div className="space-y-1 text-xs">
                      <p><span className="font-semibold">Student Name:</span> {campusLetter.student_name}</p>
                      <p><span className="font-semibold">Previous ID:</span> <span className="font-mono">{campusLetter.student_old_id}</span></p>
                      <p><span className="font-semibold">New ID:</span> <span className="font-mono text-green-700 font-bold">{campusLetter.student_new_id}</span></p>
                      <p><span className="font-semibold">Date of Transfer:</span> {new Date(campusLetter.requested_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}</p>
                  </div>
                  </div>

                  {/* Letter Content - Formal Paragraph */}
                  <div className="space-y-3 text-justify text-sm">
                    <p className="leading-relaxed">
                      Dear Sir/Madam,
                    </p>

                    <p className="leading-relaxed">
                      This letter serves as an official confirmation of the completion of the campus transfer request for the above-mentioned student. After careful review and approval by the relevant authorities, we are pleased to inform you that the transfer has been successfully processed and approved.
                    </p>

                    <p className="leading-relaxed">
                      The student is currently enrolled in <strong>{campusLetter.from_class_label}</strong> at <strong>{campusLetter.from_campus_name}</strong>. Following the approval of transfer, the student will now be enrolled in <strong>{campusLetter.to_class_label}</strong> at <strong>{campusLetter.to_campus_name}</strong>.
                    </p>

                    <p className="leading-relaxed">
                      <span className="font-semibold">Reason for Transfer:</span> {campusLetter.reason}
                    </p>

                    <p className="leading-relaxed">
                      The student has been assigned a new student ID <strong className="font-mono bg-yellow-100 px-2 py-0.5 rounded">{campusLetter.student_new_id}</strong> which will be used for all future academic records and documentation. The previous student ID <span className="font-mono">{campusLetter.student_old_id}</span> will no longer be valid.
                    </p>
                </div>
                
                  {/* Approval Authorities */}
                  <div className="bg-sky-50 border border-sky-200 p-3">
                    <p className="font-semibold text-xs text-sky-700 mb-2">APPROVED BY:</p>
                    <div className="space-y-2 text-xs">
                      {campusLetter.from_principal_name && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-200">
                          <span className="text-gray-700">From-Campus Principal:</span>
                          <span className="font-semibold">{campusLetter.from_principal_name}</span>
                  </div>
                )}
                      {campusLetter.to_principal_name && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-200">
                          <span className="text-gray-700">To-Campus Principal:</span>
                          <span className="font-semibold">{campusLetter.to_principal_name}</span>
              </div>
            )}
                      {campusLetter.to_coordinator_name && (
                        <div className="flex justify-between items-center py-2">
                          <span className="text-gray-700">To-Campus Coordinator:</span>
                          <span className="font-semibold">{campusLetter.to_coordinator_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Closing Statement */}
                  <div className="space-y-3 text-sm">
                    <p className="leading-relaxed">
                      This transfer has been processed in accordance with the school's transfer policy. Please ensure that all future correspondence and academic records reference the new student ID.
                    </p>
              
                    <p className="leading-relaxed">
                      Should you have any questions or require further clarification, please do not hesitate to contact the administration office.
                    </p>

                    <p className="leading-relaxed mt-6">
                      Best Regards,
                    </p>

                    {/* Signature and Stamp Section */}
                    <div className="flex justify-between items-start mt-8">
                      {/* Left - Signature */}
                      <div className="flex-1">
                        <div className="border-b-2 border-gray-300 pb-1 mb-2 h-16 max-w-xs"></div>
                        <p className="font-bold text-base">Signature Of Head Of Academy</p>
              </div>
              
                      {/* Right - Stamp */}
                      <div className="flex flex-col items-end">
                        <div className="border-2 border-dashed border-gray-400 rounded-lg w-24 h-24 flex items-center justify-center bg-gray-50">
                          <div className="text-center text-gray-400">
                            <div className="text-[10px] font-semibold mb-0.5">Official Stamp</div>
                            <div className="text-[8px]">Place stamp here</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Note */}
                <div className="bg-sky-50 px-8 py-4 border-t-2 border-sky-200">
                  <p className="text-xs text-sky-700 text-center italic">
                    This is an official document generated by the Idara Al-Khair School Management System.
                    For verification, please contact the administration office with reference number CT- (+92 300 299 2469)

                    .
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 justify-end px-8 py-4 bg-gray-50 border-t print:hidden">
                <Button
                  variant="outline"
                  onClick={() => {
                      setShowCampusLetter(false);
                      setCampusLetter(null);
                  }}
                >
                    Close
                </Button>

                  {/* Download button for initiating teacher */}
                  {isTeacher && currentTeacherId === selectedCampusTransfer?.initiated_by_teacher && (
                <Button
                      variant="default"
                      onClick={handleLetterDownload}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Download Letter
                </Button>
                  )}
              </div>
            </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
