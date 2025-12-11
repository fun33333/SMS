from django.core.management.base import BaseCommand
from campus.models import Campus
from timetable.models import ShiftTiming
from datetime import time

class Command(BaseCommand):
    help = 'Populates initial shift timings for Campus 6'

    def handle(self, *args, **kwargs):
        # Try to find Campus 6, or fall back to the first available campus, or create one
        try:
            campus = Campus.objects.get(pk=6)
            self.stdout.write(f"Found Campus 6: {campus.campus_name}")
        except Campus.DoesNotExist:
            self.stdout.write("Campus 6 not found. Checking for other campuses...")
            campus = Campus.objects.first()
            if campus:
                self.stdout.write(f"Using first available campus: {campus.campus_name} (ID: {campus.id})")
            else:
                self.stdout.write("No campuses found. Creating 'Campus 6'...")
                campus = Campus.objects.create(id=6, campus_name="Campus 6", address="Test Address", phone="1234567890")
                self.stdout.write(f"Created Campus 6: {campus.campus_name}")

        # Clear existing timings for this campus
        ShiftTiming.objects.filter(campus=campus).delete()

        # Morning Shift
        morning_slots = [
            ("Period 1", time(8, 0), time(8, 45), False),
            ("Period 2", time(8, 45), time(9, 30), False),
            ("Period 3", time(9, 30), time(10, 15), False),
            ("Period 4", time(10, 15), time(11, 0), False),
            ("Break",    time(11, 0), time(11, 30), True),
            ("Period 5", time(11, 30), time(12, 15), False),
            ("Period 6", time(12, 15), time(13, 0), False),
            ("Period 7", time(13, 0), time(13, 30), False),
        ]

        self.stdout.write("Creating Morning Shift Timings...")
        for i, (name, start, end, is_break) in enumerate(morning_slots):
            ShiftTiming.objects.create(
                campus=campus,
                shift='morning',
                name=name,
                start_time=start,
                end_time=end,
                is_break=is_break,
                order=i+1
            )

        # Afternoon Shift
        afternoon_slots = [
            ("Period 1", time(13, 30), time(14, 15), False),
            ("Period 2", time(14, 15), time(15, 0), False),
            ("Period 3", time(15, 0), time(15, 45), False),
            ("Break",    time(15, 45), time(16, 15), True),
            ("Period 4", time(16, 15), time(17, 0), False),
            ("Period 5", time(17, 0), time(17, 45), False),
            ("Period 6", time(17, 45), time(18, 30), False),
        ]

        self.stdout.write("Creating Afternoon Shift Timings...")
        for i, (name, start, end, is_break) in enumerate(afternoon_slots):
            ShiftTiming.objects.create(
                campus=campus,
                shift='afternoon',
                name=name,
                start_time=start,
                end_time=end,
                is_break=is_break,
                order=i+1
            )

        self.stdout.write(self.style.SUCCESS("Done!"))
