"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Eye,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Calendar,
  User,
  Send,
  ArrowRight,
  Filter,
  Search,
  UserCheck,
  X
} from "lucide-react";
import {
  getCoordinatorRequests,
  getCoordinatorDashboardStats,
  getRequestDetail,
  updateRequestStatus,
  addRequestComment,
  forwardToPrincipal,
  approveRequest,
  rejectRequest
} from "@/lib/api";
import { getCurrentUserRole } from "@/lib/permissions";
import { RequestStatusTimeline } from "@/components/RequestStatusTimeline";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";

interface Request {
  id: number;
  category: string;
  category_display: string;
  subject: string;
  description: string;
  status: string;
  status_display: string;
  priority: string;
  priority_display: string;
  teacher_name: string;
  coordinator_name: string;
  coordinator_notes?: string;
  resolution_notes?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
  reviewed_at?: string;
  resolved_at?: string;
  comments?: Comment[];
  status_history?: StatusHistory[];
  requires_principal_approval: boolean;
  teacher_confirmed: boolean;
  approved_by?: string;
}

interface Comment {
  id: number;
  user_type: string;
  comment: string;
  created_at: string;
}

interface StatusHistory {
  id: number;
  old_status?: string;
  new_status: string;
  changed_by: string;
  notes?: string;
  changed_at: string;
}

interface DashboardStats {
  total_requests: number;
  submitted: number;
  under_review: number;
  in_progress: number;
  waiting: number;
  pending_principal: number;
  approved: number;
  pending_confirmation: number;
  resolved: number;
  rejected: number;
}

const STATUS_COLORS = {
  submitted: 'bg-blue-100 text-blue-800',
  under_review: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-purple-100 text-purple-800',
  waiting: 'bg-orange-100 text-orange-800',
  pending_principal: 'bg-indigo-100 text-indigo-800',
  approved: 'bg-green-100 text-green-800',
  pending_confirmation: 'bg-teal-100 text-teal-800',
  resolved: 'bg-green-200 text-green-900',
  rejected: 'bg-red-100 text-red-800',
};

const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

export default function CoordinatorRequestPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);

  // Action Dialog States
  const [actionType, setActionType] = useState<'forward' | 'approve' | 'reject' | null>(null);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const userRole = getCurrentUserRole();

  useEffect(() => {
    if (userRole === 'coordinator') {
      document.title = "Request Management | IAK SMS";
      fetchData();
    }
  }, [userRole]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [requestsData, statsData] = await Promise.all([
        getCoordinatorRequests(),
        getCoordinatorDashboardStats()
      ]);
      setRequests(requestsData as Request[]);
      setStats(statsData as DashboardStats);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (requestId: number) => {
    try {
      const data = await getRequestDetail(requestId);
      setSelectedRequest(data as Request);
      setShowDetailModal(true);
    } catch (error) {
      console.error('Error fetching request details:', error);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedRequest) return;

    try {
      setAddingComment(true);
      await addRequestComment(selectedRequest.id, newComment);

      const updatedData = await getRequestDetail(selectedRequest.id);
      setSelectedRequest(updatedData as Request);
      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setAddingComment(false);
    }
  };

  const handleAction = async (value?: string) => {
    if (!selectedRequest || !actionType) return;

    try {
      setProcessingAction(true);

      if (actionType === 'forward') {
        await forwardToPrincipal(selectedRequest.id, {
          forwarding_note: value || ''
        });
      } else if (actionType === 'approve') {
        await approveRequest(selectedRequest.id, {
          resolution_notes: value || '',
          send_for_confirmation: true
        });
      } else if (actionType === 'reject') {
        await rejectRequest(selectedRequest.id, {
          rejection_reason: value || ''
        });
      }

      // Refresh data
      await fetchData();
      const updatedData = await getRequestDetail(selectedRequest.id);
      setSelectedRequest(updatedData as Request);
      setShowActionDialog(false);
      setActionType(null);

      alert(`Request ${actionType}ed successfully!`);
    } catch (error) {
      console.error(`Error ${actionType}ing request:`, error);
      alert(`Failed to ${actionType} request. Please try again.`);
    } finally {
      setProcessingAction(false);
    }
  };

  const openActionDialog = (type: 'forward' | 'approve' | 'reject') => {
    setActionType(type);
    setShowActionDialog(true);
  };

  const updateStatus = async (newStatus: string) => {
    if (!selectedRequest) return;
    try {
      await updateRequestStatus(selectedRequest.id, { status: newStatus });
      const updatedData = await getRequestDetail(selectedRequest.id);
      setSelectedRequest(updatedData as Request);
      fetchData(); // Refresh list
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const updatePriority = async (newPriority: string) => {
    if (!selectedRequest) return;
    try {
      await updateRequestStatus(selectedRequest.id, { priority: newPriority });
      const updatedData = await getRequestDetail(selectedRequest.id);
      setSelectedRequest(updatedData as Request);
      fetchData(); // Refresh list
    } catch (error) {
      console.error('Error updating priority:', error);
    }
  };

  const filteredRequests = requests.filter(request => {
    const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || request.priority === priorityFilter;
    const matchesSearch = searchQuery === '' ||
      request.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.teacher_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted': return <FileText className="h-4 w-4" />;
      case 'under_review': return <Eye className="h-4 w-4" />;
      case 'in_progress': return <Clock className="h-4 w-4" />;
      case 'waiting': return <AlertCircle className="h-4 w-4" />;
      case 'pending_principal': return <Send className="h-4 w-4" />;
      case 'approved': return <CheckCircle className="h-4 w-4" />;
      case 'pending_confirmation': return <UserCheck className="h-4 w-4" />;
      case 'resolved': return <CheckCircle className="h-4 w-4" />;
      case 'rejected': return <XCircle className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-extrabold text-[#274c77] mb-2 tracking-wide">Request Management</h2>
          <p className="text-gray-600 text-lg">Loading requests...</p>
        </div>
        <LoadingSpinner message="Loading requests..." />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold text-[#274c77] mb-2 tracking-wide">Request Management</h2>
        <p className="text-gray-600 text-lg">Manage and resolve teacher requests and complaints</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-blue-50 border-blue-100">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-blue-600">Total Requests</p>
              <p className="text-2xl font-bold text-blue-800">{stats.total_requests}</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 border-yellow-100">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-yellow-600">Pending Review</p>
              <p className="text-2xl font-bold text-yellow-800">
                {stats.submitted + stats.under_review}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-indigo-50 border-indigo-100">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-indigo-600">With Principal</p>
              <p className="text-2xl font-bold text-indigo-800">{stats.pending_principal}</p>
            </CardContent>
          </Card>
          <Card className="bg-teal-50 border-teal-100">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-teal-600">Pending Confirm</p>
              <p className="text-2xl font-bold text-teal-800">{stats.pending_confirmation}</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-100">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-green-600">Resolved</p>
              <p className="text-2xl font-bold text-green-800">{stats.resolved}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 w-full relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by subject or teacher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="pending_principal">Pending Principal</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending_confirmation">Pending Confirmation</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Requests List */}
      <div className="grid gap-4">
        {filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-600 mb-2">No requests found</h3>
              <p className="text-gray-500">Try adjusting your filters or search query.</p>
            </CardContent>
          </Card>
        ) : (
          filteredRequests.map((request) => (
            <Card key={request.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-[#274c77]">{request.subject}</h3>
                      <Badge className={STATUS_COLORS[request.status as keyof typeof STATUS_COLORS]}>
                        {getStatusIcon(request.status)}
                        <span className="ml-1">{request.status_display}</span>
                      </Badge>
                      <Badge className={PRIORITY_COLORS[request.priority as keyof typeof PRIORITY_COLORS]}>
                        {request.priority_display}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                      <span className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        From: {request.teacher_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        {request.category_display}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {formatDate(request.created_at)}
                      </span>
                    </div>

                    <p className="text-gray-700 line-clamp-2">{request.description}</p>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetails(request.id)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Request Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden p-0 border-0 shadow-2xl">
          <div className="overflow-y-auto max-h-[calc(90vh-2rem)] scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10 flex items-start justify-between">
              <DialogHeader className="text-left">
                <DialogTitle className="text-2xl font-bold text-[#274c77]">Request Details</DialogTitle>
                <DialogDescription className="text-gray-600">
                  Manage request status and workflow
                </DialogDescription>
              </DialogHeader>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full -mr-2 -mt-2"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {selectedRequest && (
              <div className="px-6 py-6 space-y-6">
                {/* Request Overview Section */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  {/* Header with Title and Badges */}
                  <div className="bg-gradient-to-r from-[#274c77] to-[#6096ba] px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-xl font-bold text-white flex-1">{selectedRequest.subject}</h3>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                          {getStatusIcon(selectedRequest.status)}
                          <span className="ml-1">{selectedRequest.status_display}</span>
                        </Badge>
                        <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                          {selectedRequest.priority_display}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <p className="text-gray-700 leading-relaxed">{selectedRequest.description}</p>
                  </div>

                  {/* Meta Info Grid */}
                  <div className="flex flex-wrap items-center gap-6 px-6 py-5 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="bg-blue-100 text-blue-600 p-2 rounded-lg">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Teacher</p>
                        <p className="font-semibold text-gray-900 whitespace-nowrap">{selectedRequest.teacher_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="bg-purple-100 text-purple-600 p-2 rounded-lg">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Category</p>
                        <p className="font-semibold text-gray-900 whitespace-nowrap">{selectedRequest.category_display}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="bg-orange-100 text-orange-600 p-2 rounded-lg">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Created</p>
                        <p className="font-semibold text-gray-900 whitespace-nowrap">{formatDate(selectedRequest.created_at)}</p>
                      </div>
                    </div>
                    {selectedRequest.approved_by && (
                      <div className="flex items-center gap-2">
                        <div className="bg-green-100 text-green-600 p-2 rounded-lg">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Approved By</p>
                          <p className="font-semibold text-gray-900 whitespace-nowrap capitalize">{selectedRequest.approved_by}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Section */}
                {['submitted', 'under_review', 'in_progress', 'waiting'].includes(selectedRequest.status) && (
                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                    <h4 className="text-lg font-semibold text-[#274c77] mb-4 flex items-center gap-2">
                      <UserCheck className="h-5 w-5" />
                      Actions & Workflow
                    </h4>
                    <div className="flex flex-wrap gap-3">
                      <Select
                        value={selectedRequest.status}
                        onValueChange={updateStatus}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Update Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="submitted">Submitted</SelectItem>
                          <SelectItem value="under_review">Under Review</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="waiting">Waiting</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={selectedRequest.priority}
                        onValueChange={updatePriority}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Update Priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low Priority</SelectItem>
                          <SelectItem value="medium">Medium Priority</SelectItem>
                          <SelectItem value="high">High Priority</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="flex-1 hidden md:block" />

                      <Button
                        variant="outline"
                        className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                        onClick={() => openActionDialog('forward')}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Forward to Principal
                      </Button>

                      <Button
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => openActionDialog('reject')}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>

                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => openActionDialog('approve')}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                    </div>
                  </div>
                )}

                {/* Status Timeline */}
                {selectedRequest.status_history && (
                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                    <h4 className="text-lg font-semibold text-[#274c77] mb-4 flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Request Timeline
                    </h4>
                    <RequestStatusTimeline
                      statusHistory={selectedRequest.status_history}
                      currentStatus={selectedRequest.status}
                    />
                  </div>
                )}

                {/* Comments Section */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h4 className="text-lg font-semibold text-[#274c77] mb-4 flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Comments & Notes
                  </h4>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment or note..."
                        rows={3}
                        className="bg-gray-50 border-gray-200 focus:bg-white transition-colors"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={handleAddComment}
                          disabled={addingComment || !newComment.trim()}
                          size="sm"
                          className="bg-[#6096ba] hover:bg-[#274c77]"
                        >
                          {addingComment ? (
                            <>
                              <LoadingSpinner />
                              <span className="ml-2">Adding...</span>
                            </>
                          ) : (
                            <>
                              <MessageSquare className="h-4 w-4 mr-1" />
                              Add Comment
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3 mt-6">
                      {selectedRequest.comments?.map((comment) => (
                        <div key={comment.id} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline" className={comment.user_type === 'teacher' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'}>
                              {comment.user_type === 'teacher' ? 'Teacher' : 'Coordinator'}
                            </Badge>
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(comment.created_at)}
                            </span>
                          </div>
                          <p className="text-gray-700 text-sm leading-relaxed">{comment.comment}</p>
                        </div>
                      ))}
                      {(!selectedRequest.comments || selectedRequest.comments.length === 0) && (
                        <p className="text-center text-gray-400 py-4 text-sm">No comments yet</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Action Dialog */}
      <ConfirmationDialog
        open={showActionDialog}
        onOpenChange={setShowActionDialog}
        title={
          actionType === 'forward' ? 'Forward to Principal' :
            actionType === 'approve' ? 'Approve Request' :
              'Reject Request'
        }
        description={
          actionType === 'forward' ? 'Are you sure you want to forward this request to the Principal? This will notify the Principal.' :
            actionType === 'approve' ? 'Are you sure you want to approve this request? This will notify the teacher and ask for their confirmation.' :
              'Are you sure you want to reject this request? This will notify the teacher.'
        }
        confirmText={
          actionType === 'forward' ? 'Forward' :
            actionType === 'approve' ? 'Approve' :
              'Reject'
        }
        variant={
          actionType === 'reject' ? 'destructive' :
            actionType === 'approve' ? 'success' :
              'default'
        }
        requireTextarea={true}
        textareaLabel={
          actionType === 'forward' ? 'Forwarding Note (Required)' :
            actionType === 'approve' ? 'Resolution Notes (Optional)' :
              'Rejection Reason (Required)'
        }
        textareaPlaceholder={
          actionType === 'forward' ? 'Explain why this needs principal approval...' :
            actionType === 'approve' ? 'Details about the resolution...' :
              'Explain why this request is being rejected...'
        }
        onConfirm={handleAction}
        loading={processingAction}
      />
    </div>
  );
}
