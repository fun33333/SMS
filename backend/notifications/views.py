from rest_framework import viewsets, permissions, decorators, response, status
from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ModelViewSet):
    @decorators.action(detail=False, methods=['post'])
    def delete_all(self, request):
        qs = self.get_queryset()
        count = qs.count()
        qs.delete()
        return response.Response({'deleted': count}, status=status.HTTP_200_OK)
    @decorators.action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        qs = self.get_queryset().filter(unread=True)
        count = qs.count()
        qs.update(unread=False)
        return response.Response({'marked': count}, status=status.HTTP_200_OK)
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)

    def perform_create(self, serializer):
        # force recipient to be the provided user (server-side creation)
        serializer.save()

    @decorators.action(detail=False, methods=['get'])
    def unread(self, request):
        qs = self.get_queryset().filter(unread=True)
        data = self.get_serializer(qs, many=True).data
        return response.Response(data)

    @decorators.action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        obj = self.get_queryset().filter(pk=pk).first()
        if not obj:
            return response.Response(status=status.HTTP_404_NOT_FOUND)
        obj.mark_read()
        return response.Response(self.get_serializer(obj).data)
