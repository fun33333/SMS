"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Plus,
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
    UserCheck,
    ThumbsUp,
    Info,
    AlertTriangle
} from "lucide-react";
import {
    createRequest,
    getMyRequests,
    getRequestDetail,
    addRequestComment,
    confirmCompletion,
    RequestData
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
    teacher_confirmed: boolean;
    requires_principal_approval: boolean;
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

const CATEGORY_OPTIONS = [
    { value: 'leave', label: 'Leave Request', description: 'Sick leave, casual leave, or planned time off' },
    { value: 'salary', label: 'Salary Issue', description: 'Discrepancies, delays, or slip requests' },
    { value: 'facility', label: 'Facility Complaint', description: 'Maintenance, cleaning, or furniture issues' },
    { value: 'resource', label: 'Resource Request', description: 'Books, stationery, or teaching aids' },
    { value: 'student', label: 'Student Related', description: 'Discipline, attendance, or academic concerns' },
    { value: 'admin', label: 'Administrative Issue', description: 'Timetable, scheduling, or policy questions' },
    { value: 'other', label: 'Other', description: 'Any other requests or general feedback' },
];

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

export default function TeacherRequestPage() {
    const [requests, setRequests] = useState<Request[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [addingComment, setAddingComment] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const [formData, setFormData] = useState<RequestData>({
        category: '',
        subject: '',
        description: '',
        priority: 'low', // Default priority
    });

    const userRole = getCurrentUserRole();

    useEffect(() => {
        if (userRole === 'teacher') {
            document.title = "My Requests & Complaints | IAK SMS";
            fetchRequests();
        }
    }, [userRole]);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const data = await getMyRequests();
            setRequests(data as Request[]);
        } catch (error) {
            console.error('Error fetching requests:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.category || !formData.subject || !formData.description) {
            alert('Please fill in all required fields');
            return;
        }

        try {
            setSubmitting(true);
            await createRequest(formData);

            // Reset form
            setFormData({
                category: '',
                subject: '',
                description: '',
                priority: 'low',
            });

            // Refresh requests list
            await fetchRequests();

            // Close modal
            setShowCreateModal(false);

            alert('Request submitted successfully!');
        } catch (error) {
            console.error('Error creating request:', error);
            alert('Failed to submit request. Please try again.');
        } finally {
            setSubmitting(false);
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

            // Refresh request details
            const updatedData = await getRequestDetail(selectedRequest.id);
            setSelectedRequest(updatedData as Request);
            setNewComment('');
        } catch (error) {
            console.error('Error adding comment:', error);
        } finally {
            setAddingComment(false);
        }
    };

    const handleConfirmCompletion = async (satisfactionNote?: string) => {
        if (!selectedRequest) return;

        try {
            setConfirming(true);
            await confirmCompletion(selectedRequest.id, {
                teacher_satisfaction_note: satisfactionNote
            });

            // Refresh data
            await fetchRequests();
            const updatedData = await getRequestDetail(selectedRequest.id);
            setSelectedRequest(updatedData as Request);
            setShowConfirmDialog(false);

            alert('Thank you! Your request has been marked as resolved.');
        } catch (error) {
            console.error('Error confirming completion:', error);
            alert('Failed to confirm completion. Please try again.');
        } finally {
            setConfirming(false);
        }
    };

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
                    <h2 className="text-3xl font-extrabold text-[#274c77] mb-2 tracking-wide">My Requests & Complaints</h2>
                    <p className="text-gray-600 text-lg">Loading your requests...</p>
                </div>
                <LoadingSpinner message="Loading requests..." />
            </div>
        );
    }

    // Calculate stats
    const stats = {
        total: requests.length,
        pending: requests.filter(r => ['submitted', 'under_review', 'in_progress', 'waiting', 'pending_principal'].includes(r.status)).length,
        action_needed: requests.filter(r => r.status === 'pending_confirmation' || r.status === 'approved').length,
        resolved: requests.filter(r => r.status === 'resolved').length
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-[#274c77] mb-2 tracking-wide">My Requests & Complaints</h2>
                    <p className="text-gray-600 text-lg">Submit requests and track their status with your coordinator</p>
                </div>
                <Button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-[#6096ba] hover:bg-[#274c77] text-white shadow-md transition-all hover:shadow-lg"
                    size="lg"
                >
                    <Plus className="h-5 w-5 mr-2" />
                    Create Request
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-blue-50 border-blue-100">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-blue-600">Total Requests</p>
                            <p className="text-2xl font-bold text-blue-800">{stats.total}</p>
                        </div>
                        <FileText className="h-8 w-8 text-blue-400" />
                    </CardContent>
                </Card>
                <Card className="bg-yellow-50 border-yellow-100">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-yellow-600">Pending</p>
                            <p className="text-2xl font-bold text-yellow-800">{stats.pending}</p>
                        </div>
                        <Clock className="h-8 w-8 text-yellow-400" />
                    </CardContent>
                </Card>
                <Card className="bg-teal-50 border-teal-100">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-teal-600">Action Needed</p>
                            <p className="text-2xl font-bold text-teal-800">{stats.action_needed}</p>
                        </div>
                        <UserCheck className="h-8 w-8 text-teal-400" />
                    </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-100">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-green-600">Resolved</p>
                            <p className="text-2xl font-bold text-green-800">{stats.resolved}</p>
                        </div>
                        <CheckCircle className="h-8 w-8 text-green-400" />
                    </CardContent>
                </Card>
            </div>

            {/* Requests List */}
            <div className="space-y-6">
                {requests.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <FileText className="h-12 w-12 text-gray-400 mb-4" />
                            <h3 className="text-lg font-semibold text-gray-600 mb-2">No requests found</h3>
                            <p className="text-gray-500 text-center">You haven't submitted any requests yet. Click "Create Request" to submit your first one.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-5">
                        {requests.map((request) => (
                            <Card key={request.id} className="group hover:shadow-xl transition-all duration-300 border-l-4 border-l-[#6096ba] overflow-hidden">
                                <CardContent className="p-0">
                                    <div className="flex items-stretch">
                                        {/* Left Color Accent */}
                                        <div className="w-1.5 bg-gradient-to-b from-[#6096ba] to-[#274c77]"></div>

                                        {/* Main Content */}
                                        <div className="flex-1 p-5">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 space-y-3">
                                                    {/* Title and Badges */}
                                                    <div className="flex items-start gap-3 flex-wrap">
                                                        <h3 className="text-lg font-bold text-[#274c77] group-hover:text-[#6096ba] transition-colors">
                                                            {request.subject}
                                                        </h3>
                                                        <div className="flex items-center gap-2">
                                                            <Badge className={`${STATUS_COLORS[request.status as keyof typeof STATUS_COLORS]} flex items-center gap-1 px-2.5 py-0.5 font-medium`}>
                                                                {getStatusIcon(request.status)}
                                                                <span className="text-xs">{request.status_display}</span>
                                                            </Badge>
                                                            <Badge className={`${PRIORITY_COLORS[request.priority as keyof typeof PRIORITY_COLORS]} px-2.5 py-0.5 font-medium text-xs`}>
                                                                {request.priority_display}
                                                            </Badge>
                                                        </div>
                                                    </div>

                                                    {/* Meta Information */}
                                                    <div className="flex items-center gap-4 text-sm text-gray-600">
                                                        <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-md">
                                                            <FileText className="h-3.5 w-3.5 text-[#6096ba]" />
                                                            <span className="font-medium">{request.category_display}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <User className="h-3.5 w-3.5 text-gray-400" />
                                                            <span>To: <span className="font-medium text-gray-700">{request.coordinator_name}</span></span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                            <span className="text-gray-500">{formatDate(request.created_at)}</span>
                                                        </div>
                                                    </div>

                                                    {/* Description */}
                                                    <p className="text-gray-600 line-clamp-2 text-sm leading-relaxed">
                                                        {request.description}
                                                    </p>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex flex-col gap-2 min-w-[140px]">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleViewDetails(request.id)}
                                                        className="w-full border-[#6096ba] text-[#6096ba] hover:bg-[#6096ba] hover:text-white transition-all"
                                                    >
                                                        <Eye className="h-4 w-4 mr-1.5" />
                                                        View Details
                                                    </Button>

                                                    {(request.status === 'approved' || request.status === 'pending_confirmation') && !request.teacher_confirmed && (
                                                        <Button
                                                            variant="default"
                                                            size="sm"
                                                            className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-md hover:shadow-lg transition-all"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedRequest(request);
                                                                setShowConfirmDialog(true);
                                                            }}
                                                        >
                                                            <ThumbsUp className="h-4 w-4 mr-1.5" />
                                                            Confirm
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Request Modal */}
            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
                    <div className="overflow-y-auto max-h-[calc(90vh-2rem)] scrollbar-hide">
                        {/* Clean Header */}
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-bold text-[#274c77] flex items-center gap-3">
                                    <div className="bg-[#6096ba] text-white p-2.5 rounded-lg">
                                        <Plus className="h-5 w-5" />
                                    </div>
                                    New Request Form
                                </DialogTitle>
                                <DialogDescription className="text-gray-600 mt-1.5">
                                    Submit your request and we'll process it promptly
                                </DialogDescription>
                            </DialogHeader>
                        </div>

                        <div className="px-6 py-6">
                            {/* Inline Guidelines */}
                            <div className="bg-blue-50/50 border border-blue-200/50 rounded-xl p-4 mb-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <Info className="h-4 w-4 text-blue-600" />
                                    <h4 className="font-semibold text-blue-900 text-sm">Quick Tips</h4>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-blue-800">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1 h-1 rounded-full bg-blue-500"></div>
                                        <span>Select correct <strong>Category</strong> & <strong>Priority</strong></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1 h-1 rounded-full bg-blue-500"></div>
                                        <span>Write clear <strong>Subject</strong> & details</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1 h-1 rounded-full bg-blue-500"></div>
                                        <span>Routed to your Coordinator</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1 h-1 rounded-full bg-blue-500"></div>
                                        <span>May need Principal approval</span>
                                    </div>
                                </div>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {/* Category Selection */}
                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                                            <FileText className="h-3.5 w-3.5 text-[#6096ba]" />
                                            Request Category *
                                        </Label>
                                        <Select
                                            value={formData.category}
                                            onValueChange={(value) => setFormData({ ...formData, category: value })}
                                        >
                                            <SelectTrigger className="w-full bg-white border border-gray-300 hover:border-[#6096ba] focus:border-[#6096ba] focus:ring-1 focus:ring-[#6096ba] transition-colors h-11">
                                                <SelectValue placeholder="Select a category" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {CATEGORY_OPTIONS.map((option) => (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        <div className="flex flex-col py-0.5">
                                                            <span className="font-medium text-sm">{option.label}</span>
                                                            <span className="text-xs text-gray-500">{option.description}</span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Priority Selection */}
                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                                            <AlertCircle className="h-3.5 w-3.5 text-[#6096ba]" />
                                            Priority Level *
                                        </Label>
                                        <Select
                                            value={formData.priority}
                                            onValueChange={(value) => setFormData({ ...formData, priority: value })}
                                        >
                                            <SelectTrigger className="w-full bg-white border border-gray-300 hover:border-[#6096ba] focus:border-[#6096ba] focus:ring-1 focus:ring-[#6096ba] transition-colors h-11">
                                                <SelectValue placeholder="Select priority" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="low">
                                                    <div className="flex items-center gap-2">
                                                        <span className="h-2 w-2 rounded-full bg-gray-400"></span>
                                                        Low - Routine matter
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="medium">
                                                    <div className="flex items-center gap-2">
                                                        <span className="h-2 w-2 rounded-full bg-blue-400"></span>
                                                        Medium - Needs attention
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Subject */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                                        <MessageSquare className="h-3.5 w-3.5 text-[#6096ba]" />
                                        Subject / Title *
                                    </Label>
                                    <Input
                                        value={formData.subject}
                                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                        placeholder="e.g., Leave Application for 2 Days"
                                        required
                                        className="w-full bg-white border border-gray-300 hover:border-[#6096ba] focus:border-[#6096ba] focus:ring-1 focus:ring-[#6096ba] transition-colors h-11"
                                    />
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                        <Info className="h-3 w-3" />
                                        Keep it brief and specific
                                    </p>
                                </div>

                                {/* Description */}
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                                        <FileText className="h-3.5 w-3.5 text-[#6096ba]" />
                                        Detailed Description *
                                    </Label>
                                    <Textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Please provide all necessary details, dates, and context for your request..."
                                        rows={5}
                                        required
                                        className="w-full resize-none bg-white border border-gray-300 hover:border-[#6096ba] focus:border-[#6096ba] focus:ring-1 focus:ring-[#6096ba] transition-colors"
                                    />
                                </div>

                                {/* Footer */}
                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setShowCreateModal(false)}
                                        disabled={submitting}
                                        className="px-6"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={submitting}
                                        className="bg-[#6096ba] hover:bg-[#274c77] text-white px-6 min-w-[140px] shadow-sm hover:shadow transition-all"
                                    >
                                        {submitting ? (
                                            <>
                                                <LoadingSpinner />
                                                <span className="ml-2">Submitting...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Send className="h-4 w-4 mr-2" />
                                                Submit Request
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Request Detail Modal */}
            <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-[#274c77]">Request Details</DialogTitle>
                        <DialogDescription>
                            View and manage your request details
                        </DialogDescription>
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="space-y-6">
                            {/* Request Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-[#274c77]">{selectedRequest.subject}</h3>
                                        <p className="text-gray-600">{selectedRequest.description}</p>
                                    </div>

                                    <div className="flex gap-2">
                                        <Badge className={STATUS_COLORS[selectedRequest.status as keyof typeof STATUS_COLORS]}>
                                            {getStatusIcon(selectedRequest.status)}
                                            <span className="ml-1">{selectedRequest.status_display}</span>
                                        </Badge>
                                        <Badge className={PRIORITY_COLORS[selectedRequest.priority as keyof typeof PRIORITY_COLORS]}>
                                            {selectedRequest.priority_display}
                                        </Badge>
                                    </div>

                                    {(selectedRequest.status === 'approved' || selectedRequest.status === 'pending_confirmation') && !selectedRequest.teacher_confirmed && (
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                            <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                                                <CheckCircle className="h-5 w-5" />
                                                Action Required
                                            </h4>
                                            <p className="text-green-700 mb-3">
                                                Your request has been approved! Please confirm if the work has been completed to your satisfaction.
                                            </p>
                                            <Button
                                                className="bg-green-600 hover:bg-green-700 text-white w-full"
                                                onClick={() => setShowConfirmDialog(true)}
                                            >
                                                Confirm Completion
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Category:</span>
                                        <span className="font-medium">{selectedRequest.category_display}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Coordinator:</span>
                                        <span className="font-medium">{selectedRequest.coordinator_name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Created:</span>
                                        <span className="font-medium">{formatDate(selectedRequest.created_at)}</span>
                                    </div>
                                    {selectedRequest.reviewed_at && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Reviewed:</span>
                                            <span className="font-medium">{formatDate(selectedRequest.reviewed_at)}</span>
                                        </div>
                                    )}
                                    {selectedRequest.resolved_at && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Resolved:</span>
                                            <span className="font-medium">{formatDate(selectedRequest.resolved_at)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Status Timeline */}
                            {selectedRequest.status_history && (
                                <RequestStatusTimeline
                                    statusHistory={selectedRequest.status_history}
                                    currentStatus={selectedRequest.status}
                                />
                            )}

                            {/* Coordinator Notes */}
                            {selectedRequest.coordinator_notes && (
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-[#274c77]">Coordinator Notes</h4>
                                    <div className="bg-blue-50 p-4 rounded-lg">
                                        <p className="text-gray-700">{selectedRequest.coordinator_notes}</p>
                                    </div>
                                </div>
                            )}

                            {/* Rejection Reason */}
                            {selectedRequest.rejection_reason && (
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-red-700">Rejection Reason</h4>
                                    <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                                        <p className="text-red-700">{selectedRequest.rejection_reason}</p>
                                    </div>
                                </div>
                            )}

                            {/* Resolution Notes */}
                            {selectedRequest.resolution_notes && (
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-green-700">Resolution Notes</h4>
                                    <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                                        <p className="text-green-700">{selectedRequest.resolution_notes}</p>
                                    </div>
                                </div>
                            )}

                            {/* Comments Section */}
                            <div className="space-y-4">
                                <h4 className="font-semibold text-[#274c77]">Comments</h4>

                                {/* Add Comment */}
                                <div className="space-y-2">
                                    <Textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Add a comment..."
                                        rows={3}
                                    />
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

                                {/* Comments List */}
                                <div className="space-y-3">
                                    {selectedRequest.comments?.map((comment) => (
                                        <div key={comment.id} className="bg-gray-50 p-4 rounded-lg">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Badge variant="outline">
                                                    {comment.user_type === 'teacher' ? 'Teacher' : 'Coordinator'}
                                                </Badge>
                                                <span className="text-sm text-gray-600">{formatDate(comment.created_at)}</span>
                                            </div>
                                            <p className="text-gray-700">{comment.comment}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Confirmation Dialog */}
            <ConfirmationDialog
                open={showConfirmDialog}
                onOpenChange={setShowConfirmDialog}
                title="Confirm Completion"
                description="Are you satisfied with the resolution of this request? This will mark the request as fully resolved."
                confirmText="Yes, I'm Satisfied"
                cancelText="Not yet"
                variant="success"
                requireTextarea={true}
                textareaLabel="Feedback (Optional)"
                textareaPlaceholder="Any feedback about the resolution..."
                onConfirm={handleConfirmCompletion}
                loading={confirming}
            />
        </div>
    );
}
