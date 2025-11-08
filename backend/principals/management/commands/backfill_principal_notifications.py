from django.core.management.base import BaseCommand

from principals.models import Principal


class Command(BaseCommand):
    help = "Backfill notifications for principals who have a linked user but no notification"

    def handle(self, *args, **options):
        from notifications.services import create_notification
        from notifications.models import Notification

        created = 0
        skipped = 0
        failed = 0

        principals = Principal.objects.filter(user__isnull=False)
        total = principals.count()
        self.stdout.write(f"Found {total} principals with linked users. Scanning...")

        for p in principals:
            user = p.user
            # Prefer to check for notifications tied to this principal via data.principal_id
            exists = Notification.objects.filter(recipient=user, data__principal_id=p.id).exists()
            if exists:
                skipped += 1
                continue

            verb = "You have been added as a Principal"
            # Campus model uses `campus_name` as the display field
            campus_display = getattr(p.campus, 'campus_name', str(p.campus)) if p.campus else ''
            target_text = f"at {campus_display}" if campus_display else ""

            notif = create_notification(recipient=user, actor=None, verb=verb, target_text=target_text, data={"principal_id": p.id})
            if notif:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"Created notification for Principal {p.id} -> user {user.email}"))
            else:
                failed += 1
                self.stdout.write(self.style.ERROR(f"Failed to create notification for Principal {p.id} -> user {user.email}"))

        self.stdout.write(self.style.SUCCESS(f"Done. created={created} skipped={skipped} failed={failed}"))
