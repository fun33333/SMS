"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface ConfirmationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "destructive" | "success";
    requireInput?: boolean;
    inputLabel?: string;
    inputPlaceholder?: string;
    requireTextarea?: boolean;
    textareaLabel?: string;
    textareaPlaceholder?: string;
    onConfirm: (value?: string) => void | Promise<void>;
    loading?: boolean;
}

export function ConfirmationDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "default",
    requireInput = false,
    inputLabel = "Input",
    inputPlaceholder = "Enter value...",
    requireTextarea = false,
    textareaLabel = "Details",
    textareaPlaceholder = "Enter details...",
    onConfirm,
    loading = false,
}: ConfirmationDialogProps) {
    const [inputValue, setInputValue] = useState("");
    const [textareaValue, setTextareaValue] = useState("");

    const handleConfirm = async () => {
        const value = requireTextarea ? textareaValue : requireInput ? inputValue : undefined;
        await onConfirm(value);
        // Reset values
        setInputValue("");
        setTextareaValue("");
    };

    const handleCancel = () => {
        setInputValue("");
        setTextareaValue("");
        onOpenChange(false);
    };

    const getIcon = () => {
        switch (variant) {
            case "destructive":
                return <XCircle className="h-6 w-6 text-red-600" />;
            case "success":
                return <CheckCircle className="h-6 w-6 text-green-600" />;
            default:
                return <AlertCircle className="h-6 w-6 text-blue-600" />;
        }
    };

    const getButtonVariant = () => {
        switch (variant) {
            case "destructive":
                return "destructive";
            case "success":
                return "default";
            default:
                return "default";
        }
    };

    const isDisabled = () => {
        if (loading) return true;
        if (requireInput && !inputValue.trim()) return true;
        if (requireTextarea && !textareaValue.trim()) return true;
        return false;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        {getIcon()}
                        <DialogTitle className="text-xl">{title}</DialogTitle>
                    </div>
                    <DialogDescription className="text-base">
                        {description}
                    </DialogDescription>
                </DialogHeader>

                {requireInput && (
                    <div className="space-y-2 py-4">
                        <Label htmlFor="input-field">{inputLabel}</Label>
                        <Input
                            id="input-field"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder={inputPlaceholder}
                            disabled={loading}
                        />
                    </div>
                )}

                {requireTextarea && (
                    <div className="space-y-2 py-4">
                        <Label htmlFor="textarea-field">{textareaLabel}</Label>
                        <Textarea
                            id="textarea-field"
                            value={textareaValue}
                            onChange={(e) => setTextareaValue(e.target.value)}
                            placeholder={textareaPlaceholder}
                            rows={4}
                            disabled={loading}
                        />
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                        disabled={loading}
                    >
                        {cancelText}
                    </Button>
                    <Button
                        variant={getButtonVariant()}
                        onClick={handleConfirm}
                        disabled={isDisabled()}
                        className={variant === "success" ? "bg-green-600 hover:bg-green-700" : ""}
                    >
                        {loading ? (
                            <>
                                <LoadingSpinner />
                                <span className="ml-2">Processing...</span>
                            </>
                        ) : (
                            confirmText
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
