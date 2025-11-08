from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('recipient', 'actor', 'verb', 'target_text', 'unread', 'timestamp')
    list_filter = ('unread',)
    search_fields = ('recipient__email', 'actor__email', 'verb', 'target_text')
