from django.core.management.base import BaseCommand
from django.db import transaction
from classes.models import Grade, Level, ClassRoom
from campus.models import Campus

class Command(BaseCommand):
    help = 'Setup levels, grades and classrooms for Campus 6 with Roman numerals and shifts'

    def add_arguments(self, parser):
        parser.add_argument(
            '--campus-code',
            type=str,
            default='C06',
            help='Campus code to setup (default: C06)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes',
        )

    def handle(self, *args, **options):
        campus_code = options['campus_code']
        dry_run = options['dry_run']
        
        self.stdout.write(
            self.style.SUCCESS(f'Starting setup for Campus {campus_code}...')
        )
        
        if dry_run:
            self.stdout.write(
                self.style.WARNING('DRY RUN MODE - No changes will be made')
            )
        
        # Get campus
        try:
            campus = Campus.objects.get(campus_code=campus_code)
            self.stdout.write(f'Found campus: {campus.campus_name} ({campus.campus_code})')
            self.stdout.write(f'Campus shift: {campus.shift_available}')
        except Campus.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f'Campus not found with code: {campus_code}')
            )
            return
        
        # Determine shifts based on campus shift_available
        campus_shift = campus.shift_available or 'morning'
        if campus_shift == 'both':
            shifts = ['morning', 'afternoon']
            self.stdout.write(self.style.SUCCESS('Campus has both shifts - will create structure for both'))
        elif campus_shift == 'afternoon':
            shifts = ['afternoon']
            self.stdout.write(self.style.SUCCESS('Campus has afternoon shift only'))
        else:
            shifts = ['morning']
            self.stdout.write(self.style.SUCCESS('Campus has morning shift only'))
        
        # Define levels and their grades with Roman numerals
        level_grades = {
            'Pre-Primary': ['Nursery', 'KG-I', 'KG-II', 'Special Class'],
            'Primary': ['Grade I', 'Grade II', 'Grade III', 'Grade IV', 'Grade V'],
            'Secondary': ['Grade VI', 'Grade VII', 'Grade VIII', 'Grade IX', 'Grade X']
        }
        
        # Grade name to code mapping
        grade_code_mapping = {
            'Nursery': 'N',
            'KG-I': 'KG1', 
            'KG-II': 'KG2',
            'Special Class': 'SC',
            'Grade I': 'G1',
            'Grade II': 'G2', 
            'Grade III': 'G3',
            'Grade IV': 'G4',
            'Grade V': 'G5',
            'Grade VI': 'G6',
            'Grade VII': 'G7',
            'Grade VIII': 'G8',
            'Grade IX': 'G9',
            'Grade X': 'G10'
        }
        
        # Define sections - Special Class has 4 sections, others have 5
        # You can also calculate from campus.total_classrooms if needed
        default_sections = ['A', 'B', 'C', 'D', 'E']
        special_class_sections = ['A', 'B', 'C', 'D']
        
        total_levels_created = 0
        total_grades_created = 0
        total_classrooms_created = 0
        
        with transaction.atomic():
            for shift in shifts:
                self.stdout.write(f"\n🏫 Processing {shift.title()} Shift:")
                
                for level_name, grade_names in level_grades.items():
                    # Create or get level for this shift
                    level, level_created = Level.objects.get_or_create(
                        name=level_name,
                        campus=campus,
                        shift=shift,
                        defaults={'shift': shift}
                    )
                    
                    # Update level code if needed
                    if level and not level.code:
                        level_mapping = {
                            'Pre-Primary': 'L1',
                            'Primary': 'L2', 
                            'Secondary': 'L3'
                        }
                        level_num = level_mapping.get(level_name, 'L1')
                        shift_code = shift[0].upper()  # M for morning, A for afternoon
                        level.code = f"{campus_code}-{level_num}-{shift_code}"
                        level.save()
                    
                    if level_created:
                        total_levels_created += 1
                        action = 'Would create' if dry_run else 'Created'
                        self.stdout.write(f"  ✅ {action} level: {level_name}-{shift.title()}")
                    else:
                        self.stdout.write(f"  📋 Level already exists: {level_name}-{shift.title()}")
                    
                    # Create grades for this level
                    for grade_name in grade_names:
                        # Check if grade already exists with this code
                        grade_code = grade_code_mapping.get(grade_name, grade_name[:3].upper())
                        expected_code = f"{level.code}-{grade_code}"
                        
                        # Try to find existing grade with this code
                        existing_grade = Grade.objects.filter(code=expected_code).first()
                        
                        if existing_grade:
                            grade = existing_grade
                            grade_created = False
                            self.stdout.write(f"    📋 Using existing grade: {grade_name} (Code: {grade.code})")
                        else:
                            # Create grade manually to avoid automatic code generation
                            grade = Grade(
                                name=grade_name,
                                level=level,
                                code=expected_code  # Set code directly
                            )
                            grade.save()
                            grade_created = True
                        
                        if grade_created:
                            total_grades_created += 1
                            action = 'Would create' if dry_run else 'Created'
                            self.stdout.write(f"    ✅ {action} grade: {grade_name}")
                        else:
                            self.stdout.write(f"    📋 Grade already exists: {grade_name}")
                        
                        # Determine sections based on grade - Special Class has 4 sections, others have 5
                        sections_to_use = special_class_sections if grade_name == 'Special Class' else default_sections
                        
                        # Create classrooms for this grade
                        for section in sections_to_use:
                            classroom, classroom_created = ClassRoom.objects.get_or_create(
                                grade=grade,
                                section=section,
                                shift=shift,
                                defaults={
                                    'shift': shift,
                                    'capacity': 30
                                }
                            )
                            
                            # Update classroom code if needed
                            if classroom and not classroom.code:
                                classroom.code = f"{grade.code}-{section}"
                                classroom.save()
                            
                            if classroom_created:
                                total_classrooms_created += 1
                                action = 'Would create' if dry_run else 'Created'
                                self.stdout.write(f"      ✅ {action} classroom: {grade_name}-{section}")
                            else:
                                self.stdout.write(f"      📋 Classroom already exists: {grade_name}-{section}")
        
        # Summary
        self.stdout.write(f"\n{'='*50}")
        self.stdout.write(f"📊 SUMMARY:")
        if dry_run:
            self.stdout.write(f"   Would create: {total_levels_created} levels")
            self.stdout.write(f"   Would create: {total_grades_created} grades")
            self.stdout.write(f"   Would create: {total_classrooms_created} classrooms")
        else:
            self.stdout.write(f"   Created: {total_levels_created} levels")
            self.stdout.write(f"   Created: {total_grades_created} grades")
            self.stdout.write(f"   Created: {total_classrooms_created} classrooms")
        
        self.stdout.write(
            self.style.SUCCESS(f'✅ Campus {campus_code} setup completed!')
        )