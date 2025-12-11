from django.contrib import admin

from .models import (
    TransferRequest,
    IDHistory,
    ClassTransfer,
    ShiftTransfer,
    TransferApproval,
    GradeSkipTransfer,
    CampusTransfer,
)


@admin.register(TransferRequest)
class TransferRequestAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "request_type",
        "transfer_category",
        "status",
        "student",
        "teacher",
        "from_campus",
        "to_campus",
        "from_shift",
        "to_shift",
        "requested_date",
    )
    list_filter = ("status", "request_type", "transfer_category", "from_campus", "to_campus")
    search_fields = ("student__name", "teacher__full_name", "student__student_id", "teacher__employee_code")


@admin.register(IDHistory)
class IDHistoryAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "entity_type",
        "student",
        "teacher",
        "old_id",
        "new_id",
        "changed_at",
    )
    list_filter = ("entity_type", "changed_at")
    search_fields = ("old_id", "new_id", "student__name", "teacher__full_name")


@admin.register(ClassTransfer)
class ClassTransferAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "student",
        "from_classroom",
        "to_classroom",
        "status",
        "requested_date",
        "initiated_by_teacher",
        "coordinator",
    )
    list_filter = ("status", "requested_date")
    search_fields = ("student__name", "student__student_id")
    autocomplete_fields = ("student", "from_classroom", "to_classroom", "initiated_by_teacher", "coordinator")


@admin.register(ShiftTransfer)
class ShiftTransferAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "student",
        "campus",
        "from_shift",
        "to_shift",
        "from_classroom",
        "to_classroom",
        "status",
        "requested_date",
    )
    list_filter = ("status", "from_shift", "to_shift", "campus", "requested_date")
    search_fields = ("student__name", "student__student_id")
    autocomplete_fields = (
        "student",
        "campus",
        "from_classroom",
        "to_classroom",
        "requesting_teacher",
        "from_shift_coordinator",
        "to_shift_coordinator",
        "principal",
    )


@admin.register(TransferApproval)
class TransferApprovalAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "transfer_type",
        "transfer_id",
        "role",
        "status",
        "approved_by",
        "step_order",
        "created_at",
    )
    list_filter = ("transfer_type", "role", "status")
    search_fields = ("transfer_id", "approved_by__username", "approved_by__email")


@admin.register(GradeSkipTransfer)
class GradeSkipTransferAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "student",
        "from_grade_name",
        "to_grade_name",
        "from_section",
        "to_section",
        "from_shift",
        "to_shift",
        "status",
        "requested_date",
        "initiated_by_teacher",
        "from_grade_coordinator",
        "to_grade_coordinator",
    )
    list_filter = ("status", "from_shift", "to_shift", "campus", "requested_date")
    search_fields = ("student__name", "student__student_id", "from_grade_name", "to_grade_name")
    autocomplete_fields = (
        "student",
        "campus",
        "from_grade",
        "to_grade",
        "from_classroom",
        "to_classroom",
        "initiated_by_teacher",
        "from_grade_coordinator",
        "to_grade_coordinator",
        "principal",
    )


@admin.register(CampusTransfer)
class CampusTransferAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "student",
        "from_campus",
        "to_campus",
        "from_shift",
        "to_shift",
        "skip_grade",
        "status",
        "requested_date",
        "initiated_by_teacher",
    )
    list_filter = (
        "status",
        "skip_grade",
        "from_shift",
        "to_shift",
        "from_campus",
        "to_campus",
        "requested_date",
    )
    search_fields = (
        "student__name",
        "student__student_id",
        "from_campus__campus_name",
        "to_campus__campus_name",
    )
    autocomplete_fields = (
        "student",
        "initiated_by_teacher",
    )
    readonly_fields = (
        "created_at",
        "updated_at",
    )
