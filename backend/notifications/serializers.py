from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id', 'recipient', 'actor', 'actor_name', 'verb', 'target_text', 'data', 'unread', 'timestamp'
        ]
        read_only_fields = ['id', 'recipient', 'actor_name', 'timestamp']

    def get_actor_name(self, obj):
        try:
            return str(obj.actor)
        except Exception:
            return None
