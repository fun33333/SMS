import csv
import os
from datetime import datetime, date
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.dateparse import parse_date
from teachers.models import Teacher
from campus.models import Campus
from classes.models import Grade, ClassRoom
from users.models import User
import re


class Command(BaseCommand):
    help = 'Populate teachers data from CSV file with classroom assignments'

    def add_arguments(self, parser):
        parser.add_argument(
            'csv_file_path',
            type=str,
            help='Path to the CSV file containing teacher data'
        )
        parser.add_argument(
            '--campus-code',
            type=str,
            default='C06',
            help='Campus code to assign teachers to (default: C06)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Run without actually saving data (for testing)'
        )

    def handle(self, *args, **options):
        csv_file_path = options['csv_file_path']
        campus_code = options['campus_code']
        dry_run = options['dry_run']

        self.stdout.write(f'🔍 Starting teacher data population...')
        self.stdout.write(f'📁 CSV file: {csv_file_path}')
        self.stdout.write(f'🏫 Campus code: {campus_code}')
        self.stdout.write(f'🔍 Dry run: {dry_run}')

        # Check if CSV file exists
        if not os.path.exists(csv_file_path):
            raise CommandError(f'CSV file not found: {csv_file_path}')
        
        self.stdout.write(f'✅ CSV file found: {csv_file_path}')

        # Get campus
        try:
            campus = Campus.objects.get(campus_code=campus_code)
            self.stdout.write(
                self.style.SUCCESS(f'Found campus: {campus.campus_name} ({campus.campus_code})')
            )
        except Campus.DoesNotExist:
            raise CommandError(f'Campus not found with code: {campus_code}')

        # Read CSV file
        teachers_data = []
        try:
            with open(csv_file_path, 'r', encoding='utf-8') as file:
                csv_reader = csv.DictReader(file)
                for row_num, row in enumerate(csv_reader, start=2):  # Start from 2 because header is row 1
                    teachers_data.append(row)
                    self.stdout.write(f'Read row {row_num}: {row.get("Full Name:", "Unknown")}')
        except Exception as e:
            raise CommandError(f'Error reading CSV file: {str(e)}')

        self.stdout.write(f'Total rows read: {len(teachers_data)}')

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No data will be saved'))

        # Process each teacher
        success_count = 0
        error_count = 0
        errors = []

        for row_num, teacher_data in enumerate(teachers_data, start=2):
            try:
                teacher = self.process_teacher_data(teacher_data, campus, row_num)
                
                if not dry_run:
                    teacher.save()
                    self.stdout.write(
                        self.style.SUCCESS(f'✅ Row {row_num}: Created teacher {teacher.full_name}')
                    )
                else:
                    self.stdout.write(
                        self.style.WARNING(f'🔍 Row {row_num}: Would create teacher {teacher.full_name}')
                    )
                
                success_count += 1
                
            except Exception as e:
                error_count += 1
                error_msg = f'Row {row_num}: {str(e)}'
                errors.append(error_msg)
                self.stdout.write(
                    self.style.ERROR(f'❌ {error_msg}')
                )

        # Summary
        self.stdout.write('\n' + '='*50)
        self.stdout.write('SUMMARY:')
        self.stdout.write(f'Total rows processed: {len(teachers_data)}')
        self.stdout.write(f'Successfully processed: {success_count}')
        self.stdout.write(f'Errors: {error_count}')
        
        if errors:
            self.stdout.write('\nERRORS:')
            for error in errors:
                self.stdout.write(f'  - {error}')

        if dry_run:
            self.stdout.write(self.style.WARNING('\n🔍 This was a DRY RUN - No data was actually saved'))
        else:
            self.stdout.write(self.style.SUCCESS(f'\n✅ Successfully processed {success_count} teachers'))

    def process_teacher_data(self, data, campus, row_num):
        """Process individual teacher data and create Teacher object"""
        
        # Extract and clean data
        full_name = self.clean_text(data.get('Full Name:', '').strip())
        if not full_name:
            raise ValueError('Full name is required')

        # Parse date of birth
        dob_str = data.get('Date of Birth:', '').strip()
        dob = self.parse_date(dob_str)
        if not dob:
            raise ValueError(f'Invalid date of birth: {dob_str}')

        # Parse gender
        gender_str = data.get('Gender:', '').strip().lower()
        gender = self.map_gender(gender_str)

        # Parse marital status
        marital_str = data.get('Marital Status:', '').strip().lower()
        marital_status = self.map_marital_status(marital_str)

        # Parse shift
        shift_str = data.get('Shift:', '').strip().lower()
        shift = self.map_shift(shift_str)

        # Parse joining date
        joining_date_str = data.get('Date of Joining of Current School:', '').strip()
        joining_date = self.parse_date(joining_date_str)

        # Parse CNIC
        cnic = self.clean_cnic(data.get('CNIC', '').strip())
        if not cnic:
            raise ValueError('CNIC is required')

        # Parse email - try multiple column names (EMAIL IS REQUIRED)
        email = data.get('Email Address:', '').strip()
        if not email:
            email = data.get('Email address:', '').strip()
        if not email:
            email = data.get("Teacher's Own email Address", '').strip()
        if not email:
            raise ValueError('Email is required for teacher registration')

        # Parse education level
        education_level = self.clean_text(data.get('Last Education:', '').strip())
        
        # Parse institution name
        institution_name = self.clean_text(data.get('Last Institute Name', '').strip())
        
        # Parse year of passing
        year_str = data.get('Year of Passing', '').strip()
        year_of_passing = self.parse_year(year_str)

        # Parse specialization
        specialization = self.clean_text(data.get('Specialization', '').strip())
        
        # Parse grade
        grade = self.clean_text(data.get('Grade', '').strip())

        # Parse previous work experience
        previous_institution = self.clean_text(data.get('Last Organization Name', '').strip())
        previous_position = self.clean_text(data.get('Position/Designation', '').strip())
        
        # Parse work start date
        work_start_str = data.get('Last work Start Date', '').strip()
        experience_from_date = self.parse_date(work_start_str)
        
        # Parse last day of work
        last_day_str = data.get('Last day of Previous work', '').strip()
        experience_to_date = self.parse_date(last_day_str)

        # Parse current classes and subjects
        current_classes = self.clean_text(data.get('Classes', '').strip())
        current_subjects = self.clean_text(data.get('Subjects Taught', '').strip())
        additional_responsibilities = self.clean_text(data.get('Additional Responsibilities', '').strip())

        # Parse class teacher info
        is_class_teacher_str = data.get('If class teacher', '').strip().lower()
        is_class_teacher = is_class_teacher_str in ['yes', 'y', '1', 'true']
        
        # Try multiple column names for class teacher grade
        class_teacher_grade = self.clean_text(data.get('Class teacher of class', '').strip())
        if not class_teacher_grade:
            class_teacher_grade = self.clean_text(data.get('Class teacher grade:', '').strip())
        class_teacher_section = self.clean_text(data.get('Section', '').strip())

        # Parse emergency contact
        emergency_contact = data.get('Emergency Contact Number', '').strip()
        emergency_name = data.get('Emergency Contact Name and Relationship', '').strip()

        # Create Teacher object
        teacher = Teacher(
            # Personal Information
            full_name=full_name,
            dob=dob,
            gender=gender,
            contact_number=data.get('Contact Number:', '').strip(),
            email=email,
            permanent_address=self.clean_text(data.get('Permanent Address:', '').strip()),
            current_address=self.clean_text(data.get('Temporary Address (if different):', '').strip()),
            marital_status=marital_status,
            cnic=cnic,

            # Education Information
            education_level=education_level,
            institution_name=institution_name,
            year_of_passing=year_of_passing,
            education_subjects=specialization,
            education_grade=grade,

            # Experience Information
            previous_institution_name=previous_institution,
            previous_position=previous_position,
            experience_from_date=experience_from_date,
            experience_to_date=experience_to_date,

            # Current Role Information
            joining_date=joining_date,
            current_campus=campus,
            shift=shift,
            current_subjects=current_subjects,
            current_classes_taught=current_classes,
            current_extra_responsibilities=additional_responsibilities,
            is_currently_active=True,

            # Class Teacher Information
            is_class_teacher=is_class_teacher,
            class_teacher_grade=class_teacher_grade,
            class_teacher_section=class_teacher_section,

            # System Fields
            save_status='final'
        )

        # Assign classroom if class teacher
        if is_class_teacher and class_teacher_grade and class_teacher_section:
            self.assign_classroom_to_teacher(teacher, campus, class_teacher_grade, class_teacher_section, shift)

        return teacher

    def assign_classroom_to_teacher(self, teacher, campus, grade_name, section, shift):
        """Assign classroom to teacher based on grade, section, and shift"""
        try:
            # Map grade names to Roman numerals - handle various input formats
            grade_mapping = {
                # Arabic numerals
                'Grade 1': 'Grade I',
                'Grade 2': 'Grade II', 
                'Grade 3': 'Grade III',
                'Grade 4': 'Grade IV',
                'Grade 5': 'Grade V',
                'Grade 6': 'Grade VI',
                'Grade 7': 'Grade VII',
                'Grade 8': 'Grade VIII',
                'Grade 9': 'Grade IX',
                'Grade 10': 'Grade X',
                # Class X format (alternative naming)
                'Class 1': 'Grade I',
                'Class 2': 'Grade II',
                'Class 3': 'Grade III',
                'Class 4': 'Grade IV',
                'Class 5': 'Grade V',
                'Class 6': 'Grade VI',
                'Class 7': 'Grade VII',
                'Class 8': 'Grade VIII',
                'Class 9': 'Grade IX',
                'Class 10': 'Grade X',
                # KG variations
                'KG-1': 'KG-I',
                'KG-2': 'KG-II',
                'KG1': 'KG-I',
                'KG2': 'KG-II',
                'KG-I': 'KG-I',
                'KG-II': 'KG-II',
                'KG-I ': 'KG-I',  # with trailing space
                'KG-II ': 'KG-II',  # with trailing space
                # Nursery
                'Nursery': 'Nursery',
            }
            
            # Convert grade name to Roman numeral format
            mapped_grade_name = grade_mapping.get(grade_name, grade_name)
            
            # Find the grade
            grade = Grade.objects.filter(
                name=mapped_grade_name,
                level__campus=campus,
                level__shift=shift
            ).first()
            
            if not grade:
                self.stdout.write(f"⚠️ Grade not found: {grade_name} -> {mapped_grade_name} for {shift} shift")
                return
            
            # Find the classroom
            classroom = ClassRoom.objects.filter(
                grade=grade,
                section=section,
                shift=shift
            ).first()
            
            if not classroom:
                self.stdout.write(f"⚠️ Classroom not found: {grade_name}-{section} for {shift} shift")
                return
            
            # Assign classroom to teacher
            teacher.assigned_classroom = classroom
            self.stdout.write(f"✅ Assigned classroom: {grade_name}-{section} to {teacher.full_name}")
            
        except Exception as e:
            self.stdout.write(f"❌ Error assigning classroom: {str(e)}")

    def clean_text(self, text):
        """Clean and normalize text data"""
        if not text or text.strip() in ['000', '0000', 'nil', 'N/A', 'No']:
            return ''
        return text.strip()

    def clean_cnic(self, cnic):
        """Clean and validate CNIC"""
        if not cnic or cnic.strip() in ['000', '0000', 'nil', 'N/A']:
            return ''
        
        # Remove any non-digit characters except hyphens
        cleaned = re.sub(r'[^\d-]', '', cnic.strip())
        
        # Validate CNIC format (should be 13 digits with optional hyphens)
        digits_only = re.sub(r'-', '', cleaned)
        if len(digits_only) == 13 and digits_only.isdigit():
            return cleaned
        else:
            return cnic.strip()  # Return original if validation fails

    def parse_date(self, date_str):
        """Parse various date formats"""
        if not date_str or date_str.strip() in ['000', '0000', 'nil', 'N/A']:
            return None

        date_str = date_str.strip()
        
        # Common date formats to try
        date_formats = [
            '%d-%b-%y',      # 28-Jul-93
            '%d-%b-%Y',      # 28-Jul-1993
            '%d/%m/%Y',      # 28/07/1993
            '%d-%m-%Y',      # 28-07-1993
            '%Y-%m-%d',      # 1993-07-28
            '%d-%m-%y',      # 28-07-93
            '%d/%m/%y',      # 28/07/93
        ]

        for fmt in date_formats:
            try:
                parsed_date = datetime.strptime(date_str, fmt).date()
                # Handle 2-digit years
                if parsed_date.year < 1950:
                    parsed_date = parsed_date.replace(year=parsed_date.year + 100)
                return parsed_date
            except ValueError:
                continue

        # Try parsing with dateutil if available
        try:
            from dateutil import parser
            return parser.parse(date_str).date()
        except:
            pass

        return None

    def parse_year(self, year_str):
        """Parse year from string"""
        if not year_str or year_str.strip() in ['000', '0000', 'nil', 'N/A']:
            return None
        
        try:
            year = int(year_str.strip())
            # Handle 2-digit years
            if year < 50:
                year += 2000
            elif year < 100:
                year += 1900
            return year
        except ValueError:
            return None

    def map_gender(self, gender_str):
        """Map gender string to model choice"""
        gender_map = {
            'male': 'male',
            'm': 'male',
            'female': 'female',
            'f': 'female',
            'other': 'other',
            'o': 'other'
        }
        return gender_map.get(gender_str, 'other')

    def map_marital_status(self, status_str):
        """Map marital status string to model choice"""
        status_map = {
            'single': 'single',
            'married': 'married',
            'divorced': 'divorced',
            'widowed': 'widowed'
        }
        return status_map.get(status_str, 'single')

    def map_shift(self, shift_str):
        """Map shift string to model choice"""
        shift_map = {
            'morning': 'morning',
            'afternoon': 'afternoon',
            'both': 'both',
            'morning afternoon': 'both',
            'afternoon morning': 'both'
        }
        return shift_map.get(shift_str, 'morning')