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
  getClassTransfers,
  getShiftTransfers,
  approveClassTransfer,
  declineClassTransfer,
  approveShiftTransferOwn,
  approveShiftTransferOther,
  declineShiftTransfer,
} from '@/lib/api';
import { getCurrentUserRole } from '@/lib/permissions';

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
  const [classStatusFilter, setClassStatusFilter] = useState<'pending' | 'history'>('pending');
  const [shiftStatusFilter, setShiftStatusFilter] = useState<'pending' | 'history'>('pending');
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null);

  // UI State
  const [selectedRequest, setSelectedRequest] = useState<TransferRequest | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const [selectedClassTransfer, setSelectedClassTransfer] = useState<ClassTransfer | null>(null);
  const [selectedShiftTransfer, setSelectedShiftTransfer] = useState<ShiftTransfer | null>(null);

  // Load data on mount based on role
  useEffect(() => {
    if (isPrincipal) {
      loadPrincipalTransferRequests();
    } else {
      loadTeacherCoordinatorTransfers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrincipal, isTeacher, isCoordinator]);

  const loadPrincipalTransferRequests = async () => {
    try {
      setLoading(true);
      const [outgoing, incoming] = await Promise.all([
        getTransferRequests({ direction: 'outgoing' }),
        getTransferRequests({ direction: 'incoming' }),
      ]);
      setOutgoingRequests(outgoing as TransferRequest[]);
      setIncomingRequests(incoming as TransferRequest[]);
    } catch (error) {
      console.error('Error loading transfer requests:', error);
      toast.error('Failed to load transfer requests');
    } finally {
      setLoading(false);
    }
  };

  const loadTeacherCoordinatorTransfers = async () => {
    try {
      setLoading(true);
      const [classes, shifts] = await Promise.all([
        getClassTransfers(),
        getShiftTransfers(),
      ]);
      setClassTransfers(classes as ClassTransfer[]);
      setShiftTransfers(shifts as ShiftTransfer[]);
    } catch (error) {
      console.error('Error loading transfers:', error);
      toast.error('Failed to load transfer data');
    } finally {
      setLoading(false);
    }
  };

  // Principal actions
  const handleApprove = async (requestId: number) => {
    try {
      setActionLoading(requestId);
      await approveTransfer(requestId);
      toast.success('Transfer approved successfully');
      await loadPrincipalTransferRequests();
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
      await loadPrincipalTransferRequests();
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
      await loadPrincipalTransferRequests();
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
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              {request.request_type === 'student' ? (
                <GraduationCap className="h-5 w-5 text-blue-600" />
              ) : (
                <User className="h-5 w-5 text-green-600" />
              )}
              <div>
                <h3 className="font-semibold text-lg">
                  {request.entity_name}
                </h3>
                <p className="text-sm text-gray-600">
                  {request.current_id}
                </p>
              </div>
              {getStatusIcon(request.status)}
            </div>
            
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <Building className="h-4 w-4 text-gray-400" />
                <span className="font-medium">From:</span>
                <span>{request.from_campus_name} ({request.from_shift === 'M' ? 'Morning' : 'Afternoon'})</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Building className="h-4 w-4 text-gray-400" />
                <span className="font-medium">To:</span>
                <span>{request.to_campus_name} ({request.to_shift === 'M' ? 'Morning' : 'Afternoon'})</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="font-medium">Requested:</span>
                <span>{new Date(request.requested_date).toLocaleDateString()}</span>
              </div>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Reason:</span> {request.reason}
              </p>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusBadge(request.status)}
                {request.decline_reason && (
                  <Badge variant="outline" className="text-red-600">
                    {request.decline_reason}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedRequest(request);
                    setShowDetails(true);
                  }}
                >
                  <Eye className="h-4 w-4 mr-1" />
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
                        className="bg-green-600 hover:bg-green-700"
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
        className="hover:shadow-md transition-shadow border border-gray-100 rounded-2xl bg-white/80"
      >
        <CardContent className="p-3 md:p-4">
          {/* Clickable summary row */}
          <button
            type="button"
            onClick={() =>
              setExpandedClassId(prev => (prev === transfer.id ? null : transfer.id))
            }
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <GraduationCap className="h-5 w-5 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm md:text-base text-gray-900 truncate">
                    {transfer.student_name}
                  </h3>
                  {getStatusIcon(transfer.status)}
                </div>
                <p className="text-[11px] text-gray-500 truncate">
                  {transfer.student_id}
                </p>
              </div>
            </div>

            <div className="hidden md:flex flex-col items-end text-[11px] text-gray-600 flex-1">
              <span className="font-medium text-gray-700">
                {fromText} <span className="mx-1 text-gray-400">→</span> {toText}
              </span>
              <span>
                {new Date(transfer.requested_date).toLocaleDateString()}
                {transfer.initiated_by_teacher_name
                  ? ` · ${transfer.initiated_by_teacher_name}`
                  : ''}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:block">{getStatusBadge(transfer.status)}</div>
              <ChevronDown
                className={`h-4 w-4 text-gray-400 transition-transform ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>

          {/* Expanded details */}
          {isExpanded && (
            <div className="mt-3 border-t border-blue-100 pt-3 space-y-3 text-xs md:text-sm">
              {/* From / To summary */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-blue-900">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowRightLeft className="h-3 w-3 md:h-4 md:w-4" />
                  <span className="font-semibold text-xs">Class Transfer</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(transfer.status)}
                  {transfer.decline_reason && (
                    <Badge variant="outline" className="text-red-600">
                      {transfer.decline_reason}
                    </Badge>
                  )}
                </div>

                {isCoordinator && transfer.status === 'pending' && (
                  <div className="flex items-center gap-2">
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
                      className="bg-green-600 hover:bg-green-700"
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
                    >
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderShiftTransferCard = (transfer: ShiftTransfer) => (
    <Card
      key={transfer.id}
      className="hover:shadow-md transition-shadow border border-gray-100 rounded-2xl bg-white/80"
    >
      <CardContent className="p-5 md:p-6">
        <div className="flex flex-col gap-3">
          {/* Header: student + meta */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <GraduationCap className="h-5 w-5 text-indigo-600" />
              <div>
                <h3 className="font-semibold text-base md:text-lg text-gray-900">
                  {transfer.student_name}
                </h3>
                <p className="text-xs text-gray-500">{transfer.student_id}</p>
              </div>
              {getStatusIcon(transfer.status)}
            </div>
            <div className="text-right text-xs text-gray-500 space-y-1">
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
          </div>

          {/* Shift + class summary */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs md:text-sm text-indigo-900">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRightLeft className="h-3 w-3 md:h-4 md:w-4" />
              <span className="font-semibold">Shift Transfer</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <p className="text-[11px] uppercase tracking-wide text-indigo-700 font-semibold">
                  From
                </p>
                <p className="font-semibold">
                  {(transfer.from_classroom_display || 'Current class') +
                    ' • ' +
                    transfer.from_shift}
                </p>
                {transfer.from_shift_coordinator_name && (
                  <p className="text-[11px] text-indigo-800">
                    Coordinator: {transfer.from_shift_coordinator_name}
                  </p>
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-[11px] uppercase tracking-wide text-indigo-700 font-semibold">
                  To
                </p>
                <p className="font-semibold">
                  {(transfer.to_classroom_display || 'Same grade/section') +
                    ' • ' +
                    transfer.to_shift}
                </p>
                {transfer.to_shift_coordinator_name && (
                  <p className="text-[11px] text-indigo-800">
                    Coordinator: {transfer.to_shift_coordinator_name}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-2 text-[11px] text-indigo-800">
              <span className="font-medium">Campus: </span>
              <span>{transfer.campus_name}</span>
            </div>
          </div>

          {/* Reason */}
          <div className="text-sm text-gray-700">
            <span className="font-medium">Reason:</span>{' '}
            <span>{transfer.reason}</span>
          </div>

          {/* Footer: status + actions */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              {getStatusBadge(transfer.status)}
              {transfer.decline_reason && (
                <Badge variant="outline" className="text-red-600">
                  {transfer.decline_reason}
                </Badge>
              )}
            </div>

            {isCoordinator &&
              (transfer.status === 'pending_own_coord' ||
                transfer.status === 'pending_other_coord') && (
                <div className="flex items-center gap-2">
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
                    className="bg-green-600 hover:bg-green-700"
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
                  >
                    Decline
                  </Button>
                </div>
              )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading transfer requests...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Teacher / Coordinator view: only class + shift transfers
  if (!isPrincipal) {
    const pendingClassCount = classTransfers.filter(t => t.status === 'pending').length;
    const historyClassCount = classTransfers.length - pendingClassCount;

    const pendingShiftCount = shiftTransfers.filter(
      t => t.status === 'pending_own_coord' || t.status === 'pending_other_coord',
    ).length;
    const historyShiftCount = shiftTransfers.length - pendingShiftCount;

    const filteredClassTransfers =
      classStatusFilter === 'pending'
        ? classTransfers.filter(t => t.status === 'pending')
        : classTransfers;

    const filteredShiftTransfers =
      shiftStatusFilter === 'pending'
        ? shiftTransfers.filter(
            t => t.status === 'pending_own_coord' || t.status === 'pending_other_coord',
          )
        : shiftTransfers;
    return (
      <div className="min-h-[60vh] bg-gray-50 p-6 pb-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.back()}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Transfer Management</h1>
                <p className="text-gray-600">
                  View and manage class and shift transfer requests
                </p>
              </div>
            </div>
            <Button
              onClick={() => router.push('/admin/principals/transfers/create')}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Transfer Request
            </Button>
          </div>

          <Tabs defaultValue="class" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="class">
                Class Transfers
              </TabsTrigger>
              <TabsTrigger value="shift">
                Shift Transfers
              </TabsTrigger>
            </TabsList>

            <TabsContent value="class" className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Class Transfers</h2>
                <div className="inline-flex rounded-full bg-gray-100 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setClassStatusFilter('pending')}
                    className={`px-3 py-1 rounded-full transition ${
                      classStatusFilter === 'pending'
                        ? 'bg-white shadow-sm text-blue-600'
                        : 'text-gray-500'
                    }`}
                  >
                    Pending ({pendingClassCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setClassStatusFilter('history')}
                    className={`px-3 py-1 rounded-full transition ${
                      classStatusFilter === 'history'
                        ? 'bg-white shadow-sm text-blue-600'
                        : 'text-gray-500'
                    }`}
                  >
                    History ({historyClassCount})
                  </button>
                </div>
              </div>
              {filteredClassTransfers.length === 0 ? (
                <Card className="border-dashed border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                  <CardContent className="py-10 px-6 text-center flex flex-col items-center justify-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center mb-1">
                      <FileText className="h-6 w-6 text-blue-500" />
                    </div>
                    <p className="text-base font-semibold text-gray-800">
                      {classStatusFilter === 'pending'
                        ? 'No pending class transfers'
                        : 'No class transfer history yet'}
                    </p>
                    <p className="text-xs text-gray-500 max-w-md">
                      {classStatusFilter === 'pending'
                        ? 'There are currently no class/section transfer requests waiting for your approval.'
                        : 'When transfers are approved or declined, they will appear here for your reference.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {filteredClassTransfers.map(transfer => renderClassTransferCard(transfer))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="shift" className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Shift Transfers</h2>
                <div className="inline-flex rounded-full bg-gray-100 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setShiftStatusFilter('pending')}
                    className={`px-3 py-1 rounded-full transition ${
                      shiftStatusFilter === 'pending'
                        ? 'bg-white shadow-sm text-blue-600'
                        : 'text-gray-500'
                    }`}
                  >
                    Pending ({pendingShiftCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setShiftStatusFilter('history')}
                    className={`px-3 py-1 rounded-full transition ${
                      shiftStatusFilter === 'history'
                        ? 'bg-white shadow-sm text-blue-600'
                        : 'text-gray-500'
                    }`}
                  >
                    History ({historyShiftCount})
                  </button>
                </div>
              </div>
              {filteredShiftTransfers.length === 0 ? (
                <Card className="border-dashed border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
                  <CardContent className="py-10 px-6 text-center flex flex-col items-center justify-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center mb-1">
                      <ArrowRightLeft className="h-6 w-6 text-indigo-500" />
                    </div>
                    <p className="text-base font-semibold text-gray-800">
                      {shiftStatusFilter === 'pending'
                        ? 'No pending shift transfers'
                        : 'No shift transfer history yet'}
                    </p>
                    <p className="text-xs text-gray-500 max-w-md">
                      {shiftStatusFilter === 'pending'
                        ? 'There are currently no shift transfer requests waiting for your approval.'
                        : 'Approved or declined shift transfers will be listed here for your records.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {filteredShiftTransfers.map(transfer => renderShiftTransferCard(transfer))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Shared Decline Dialog for class/shift transfers (coordinator) */}
          <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                  Decline Transfer Request
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Are you sure you want to decline this transfer request? This action
                    cannot be undone.
                  </AlertDescription>
                </Alert>

                <div>
                  <Label htmlFor="decline_reason">Reason for declining *</Label>
                  <Textarea
                    id="decline_reason"
                    placeholder="Please provide a reason for declining this transfer..."
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    rows={3}
                    className="mt-1"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeclineDialog(false);
                      setDeclineReason('');
                      setSelectedClassTransfer(null);
                      setSelectedShiftTransfer(null);
                    }}
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
                        } else if (selectedShiftTransfer) {
                          setActionLoading(selectedShiftTransfer.id);
                          await declineShiftTransfer(selectedShiftTransfer.id, declineReason);
                          toast.success('Shift transfer declined');
                        }
                        setShowDeclineDialog(false);
                        setDeclineReason('');
                        setSelectedClassTransfer(null);
                        setSelectedShiftTransfer(null);
                        await loadTeacherCoordinatorTransfers();
                      } catch (error: any) {
                        console.error('Error declining transfer:', error);
                        toast.error(error.message || 'Failed to decline transfer');
                      } finally {
                        setActionLoading(null);
                      }
                    }}
                    disabled={!declineReason.trim()}
                  >
                    {actionLoading ? 'Declining...' : 'Decline Transfer'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  // Principal view (original)
  return (
    <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.back()}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Transfer Management</h1>
              <p className="text-gray-600">Manage student and teacher transfers</p>
            </div>
          </div>
          <Button
            onClick={() => router.push('/admin/principals/transfers/create')}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Transfer
          </Button>
        </div>
        
        {/* Tabs */}
        <Tabs defaultValue="outgoing" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="outgoing">
              Outgoing Requests ({outgoingRequests.length})
            </TabsTrigger>
            <TabsTrigger value="incoming">
              Incoming Requests ({incomingRequests.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="outgoing" className="space-y-4">
            {outgoingRequests.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4" />
                    <p className="text-lg font-medium">No outgoing requests</p>
                    <p className="text-sm">You haven't created any transfer requests yet.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {outgoingRequests.map(request => renderRequestCard(request, true))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="incoming" className="space-y-4">
            {incomingRequests.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4" />
                    <p className="text-lg font-medium">No incoming requests</p>
                    <p className="text-sm">No transfer requests have been sent to you yet.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {incomingRequests.map(request => renderRequestCard(request, false))}
              </div>
            )}
          </TabsContent>
        </Tabs>
        
        {/* Request Details Dialog */}
        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Transfer Request Details</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Type</Label>
                    <p className="text-sm">
                      {selectedRequest.request_type === 'student' ? 'Student Transfer' : 'Teacher Transfer'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Status</Label>
                    <div className="mt-1">
                      {getStatusBadge(selectedRequest.status)}
                    </div>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-500">Entity</Label>
                  <p className="text-sm font-medium">{selectedRequest.entity_name}</p>
                  <p className="text-xs text-gray-600">{selectedRequest.current_id}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">From</Label>
                    <p className="text-sm">
                      {selectedRequest.from_campus_name} ({selectedRequest.from_shift === 'M' ? 'Morning' : selectedRequest.from_shift === 'A' ? 'Afternoon' : 'Both'})
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">To</Label>
                    <p className="text-sm">
                      {selectedRequest.to_campus_name} ({selectedRequest.to_shift === 'M' ? 'Morning' : selectedRequest.to_shift === 'A' ? 'Afternoon' : 'Both'})
                    </p>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-500">Reason</Label>
                  <p className="text-sm">{selectedRequest.reason}</p>
                </div>
                
                {selectedRequest.notes && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Notes</Label>
                    <p className="text-sm">{selectedRequest.notes}</p>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Requested Date</Label>
                    <p className="text-sm">{new Date(selectedRequest.requested_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Created</Label>
                    <p className="text-sm">{new Date(selectedRequest.created_at).toLocaleString()}</p>
                  </div>
                </div>
                
                {selectedRequest.decline_reason && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Decline Reason</Label>
                    <p className="text-sm text-red-600">{selectedRequest.decline_reason}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
        
        {/* Decline Dialog */}
        <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                Decline Transfer Request
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Are you sure you want to decline this transfer request? This action cannot be undone.
                </AlertDescription>
              </Alert>
              
              <div>
                <Label htmlFor="decline_reason">Reason for declining *</Label>
                <Textarea
                  id="decline_reason"
                  placeholder="Please provide a reason for declining this transfer..."
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={3}
                  className="mt-1"
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeclineDialog(false);
                    setDeclineReason('');
                    setSelectedRequest(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDecline}
                  disabled={!declineReason.trim() || actionLoading === selectedRequest?.id}
                >
                  {actionLoading === selectedRequest?.id ? 'Declining...' : 'Decline Transfer'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
