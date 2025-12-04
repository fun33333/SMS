import os
import django
import sys

# Setup Django environment
sys.path.append('c:/My-Projects/LMS/IAK-SMS/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from campus.models import Campus
from timetable.models import ShiftTiming
from datetime import time

def create_timings():
    try:
        campus = Campus.objects.get(pk=6) # Campus 6
        print(f"Found campus: {campus.campus_name}")
    except Campus.DoesNotExist:
        print("Campus 6 not found!")
        return

    # Clear existing timings for this campus to avoid duplicates/conflicts during dev
    ShiftTiming.objects.filter(campus=campus).delete()

    # Morning Shift (Based on previous TIME_SLOTS)
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

    print("Creating Morning Shift Timings...")
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

    # Afternoon Shift (Hypothetical - 1:30 PM to 6:30 PM)
    afternoon_slots = [
        ("Period 1", time(13, 30), time(14, 15), False),
        ("Period 2", time(14, 15), time(15, 0), False),
        ("Period 3", time(15, 0), time(15, 45), False),
        ("Break",    time(15, 45), time(16, 15), True),
        ("Period 4", time(16, 15), time(17, 0), False),
        ("Period 5", time(17, 0), time(17, 45), False),
        ("Period 6", time(17, 45), time(18, 30), False),
    ]

    print("Creating Afternoon Shift Timings...")
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

    print("Done!")

if __name__ == "__main__":
    create_timings()
