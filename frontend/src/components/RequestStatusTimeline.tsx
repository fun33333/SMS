"use client";

import { CheckCircle, Clock, XCircle, AlertCircle, FileText, Eye, Send, UserCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StatusHistoryItem {
    id: number;
    old_status?: string;
    new_status: string;
    changed_by: string;
    notes?: string;
    changed_at: string;
}

interface RequestStatusTimelineProps {
    statusHistory: StatusHistoryItem[];
    currentStatus: string;
}

const STATUS_CONFIG = {
    submitted: {
        icon: FileText,
        color: "text-blue-600",
        bgColor: "bg-blue-100",
        label: "Submitted"
    },
    under_review: {
        icon: Eye,
        color: "text-yellow-600",
        bgColor: "bg-yellow-100",
        label: "Under Review"
    },
    in_progress: {
        icon: Clock,
        color: "text-purple-600",
        bgColor: "bg-purple-100",
        label: "In Progress"
    },
    waiting: {
        icon: AlertCircle,
        color: "text-orange-600",
        bgColor: "bg-orange-100",
        label: "Waiting"
    },
    pending_principal: {
        icon: Send,
        color: "text-indigo-600",
        bgColor: "bg-indigo-100",
        label: "Pending Principal Approval"
    },
    approved: {
        icon: CheckCircle,
        color: "text-green-600",
        bgColor: "bg-green-100",
        label: "Approved"
    },
    pending_confirmation: {
        icon: UserCheck,
        color: "text-teal-600",
        bgColor: "bg-teal-100",
        label: "Pending Teacher Confirmation"
    },
    resolved: {
        icon: CheckCircle,
        color: "text-green-700",
        bgColor: "bg-green-200",
        label: "Resolved"
    },
    rejected: {
        icon: XCircle,
        color: "text-red-600",
        bgColor: "bg-red-100",
        label: "Rejected"
    }
};

export function RequestStatusTimeline({ statusHistory, currentStatus }: RequestStatusTimelineProps) {
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusConfig = (status: string) => {
        return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.submitted;
    };

    return (
        <Card>
            <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-[#274c77] mb-6">Request Timeline</h3>

                <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

                    {/* Timeline items */}
                    <div className="space-y-6">
                        {statusHistory.map((item, index) => {
                            const config = getStatusConfig(item.new_status);
                            const Icon = config.icon;
                            const isLast = index === statusHistory.length - 1;

                            return (
                                <div key={item.id} className="relative flex items-start gap-4">
                                    {/* Icon */}
                                    <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full ${config.bgColor}`}>
                                        <Icon className={`h-6 w-6 ${config.color}`} />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 pt-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            <Badge className={`${config.bgColor} ${config.color}`}>
                                                {config.label}
                                            </Badge>
                                            {isLast && (
                                                <Badge variant="outline" className="text-xs">
                                                    Current
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="text-sm text-gray-600 mb-1">
                                            Changed by <span className="font-medium capitalize">{item.changed_by}</span>
                                        </div>

                                        <div className="text-xs text-gray-500 mb-2">
                                            {formatDate(item.changed_at)}
                                        </div>

                                        {item.notes && (
                                            <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                <p className="text-sm text-gray-700">{item.notes}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
