import csv
import os
from datetime import datetime, date
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.dateparse import parse_date
from students.models import Student
from campus.models import Campus
from classes.models import Grade, ClassRoom
import re


class Command(BaseCommand):
    help = 'Populate students data from CSV file with classroom assignments'

    def add_arguments(self, parser):
        parser.add_argument(
            'csv_file_path',
            type=str,
            help='Path to the CSV file containing student data'
        )
        parser.add_argument(
            '--campus-code',
            type=str,
            default='C06',
            help='Campus code to assign students to (default: C06)'
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

        self.stdout.write(f'🔍 Starting student data population...')
        self.stdout.write(f'📁 CSV file: {csv_file_path}')
        self.stdout.write(f'🏫 Campus code: {campus_code}')
        self.stdout.write(f'🔍 Dry run: {dry_run}')

        # Resolve CSV file path - check multiple locations
        resolved_path = self.resolve_csv_path(csv_file_path)
        if not resolved_path:
            raise CommandError(f'CSV file not found: {csv_file_path}\n💡 Tip: Make sure the file exists in the backend directory')
        
        csv_file_path = resolved_path
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
        students_data = []
        try:
            with open(csv_file_path, 'r', encoding='utf-8') as file:
                csv_reader = csv.DictReader(file)
                for row_num, row in enumerate(csv_reader, start=2):  # Start from 2 because header is row 1
                    students_data.append(row)
                    if row_num <= 10:  # Show first 10 rows
                        self.stdout.write(f'Read row {row_num}: {row.get("Student Name", "Unknown")}')
        except Exception as e:
            raise CommandError(f'Error reading CSV file: {str(e)}')

        self.stdout.write(f'Total rows read: {len(students_data)}')

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No data will be saved'))

        # Process each student
        success_count = 0
        error_count = 0
        errors = []

        for row_num, student_data in enumerate(students_data, start=2):
            try:
                student = self.process_student_data(student_data, campus, row_num)
                
                if not dry_run:
                    student.save()
                    self.stdout.write(
                        self.style.SUCCESS(f'✅ Row {row_num}: Created student {student.name}')
                    )
                else:
                    self.stdout.write(
                        self.style.WARNING(f'🔍 Row {row_num}: Would create student {student.name}')
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
        self.stdout.write(f'Total rows processed: {len(students_data)}')
        self.stdout.write(f'Successfully processed: {success_count}')
        self.stdout.write(f'Errors: {error_count}')
        
        if errors:
            self.stdout.write('\nERRORS:')
            for error in errors[:10]:  # Show first 10 errors
                self.stdout.write(f'  - {error}')
            if len(errors) > 10:
                self.stdout.write(f'  ... and {len(errors) - 10} more errors')

        if dry_run:
            self.stdout.write(self.style.WARNING('\n🔍 This was a DRY RUN - No data was actually saved'))
        else:
            self.stdout.write(self.style.SUCCESS(f'\n✅ Successfully processed {success_count} students'))

    def process_student_data(self, data, campus, row_num):
        """Process individual student data and create Student object"""
        
        # Extract and clean data
        name = self.clean_text(data.get('Student Name', '').strip())
        if not name:
            raise ValueError('Student name is required')

        # Parse date of birth
        dob_str = data.get('Date of Birth', '').strip()
        dob = self.parse_date(dob_str)
        
        # Parse gender
        gender_str = data.get('Gender', '').strip().lower()
        gender = self.map_gender(gender_str)

        # Parse shift
        shift_str = data.get('Shift', '').strip().lower()
        shift = self.map_shift(shift_str)

        # Parse enrollment year
        year_str = data.get('Year of Admission', '').strip()
        enrollment_year = self.parse_year(year_str)

        # Parse current grade and section
        current_grade = self.clean_text(data.get('Current Grade/Class', '').strip())
        section = self.clean_text(data.get('Section', '').strip())

        # Parse contact information
        father_name = self.clean_text(data.get('Father Name', '').strip())
        father_cnic = self.clean_cnic(data.get('Father CNIC', '').strip())
        father_contact = self.clean_phone(data.get('Father Contact Number', '').strip())
        father_profession = self.clean_text(data.get('Father Occupation', '').strip())

        guardian_name = self.clean_text(data.get('Guardian Name', '').strip())
        guardian_cnic = self.clean_cnic(data.get('Guardian CNIC', '').strip())
        guardian_profession = self.clean_text(data.get('Guardian Occupation', '').strip())

        mother_name = self.clean_text(data.get('Mother Name', '').strip())
        mother_cnic = self.clean_cnic(data.get('Mother CNIC', '').strip())
        mother_contact = self.clean_phone(data.get('Mother Contact Number', '').strip())
        mother_profession = self.clean_text(data.get('Mother Occupation', '').strip())

        emergency_contact = self.clean_phone(data.get('Emergency Contact Number', '').strip())

        # Parse address
        address = self.clean_text(data.get('Address', '').strip())

        # Parse other fields
        place_of_birth = self.clean_text(data.get('Place of Birth', '').strip())
        religion = self.clean_text(data.get('Religion', '').strip())
        mother_tongue = self.clean_text(data.get('Mother Tongue', '').strip())

        # Parse old school information
        last_school = self.clean_text(data.get('Last School Name', '').strip())
        last_class_passed = self.clean_text(data.get('Last Class Passed', '').strip())
        old_gr_number = self.clean_text(data.get('Old GR No', '').strip())

        # Parse family information
        family_income_str = self.clean_text(data.get('Family Income', '').strip())
        family_income = self.parse_decimal(family_income_str)
        
        house_owned_str = self.clean_text(data.get('House Owned', '').strip())
        house_owned = self.parse_boolean(house_owned_str)
        
        house_rent_str = self.clean_text(data.get('House rent', '').strip())
        rent_amount = self.parse_decimal(house_rent_str)
        
        zakat_status_str = self.clean_text(data.get('Zakat Status:', '').strip())
        zakat_status = self.map_zakat_status(zakat_status_str)

        # Parse siblings information
        siblings_in_alkhair_str = self.clean_text(data.get('Siblings in Al-Khair', '').strip())
        sibling_in_alkhair = self.map_yes_no(siblings_in_alkhair_str)
        
        # Parse father status
        father_status_str = self.clean_text(data.get('Father Status', '').strip())
        father_status = self.map_father_status(father_status_str)

        # Create Student object
        student = Student(
            # Personal Information
            name=name,
            gender=gender,
            dob=dob,
            place_of_birth=place_of_birth,
            religion=religion,
            mother_tongue=mother_tongue,

            # Contact Information
            emergency_contact=emergency_contact,
            father_name=father_name,
            father_cnic=father_cnic,
            father_contact=father_contact,
            father_profession=father_profession,

            guardian_name=guardian_name,
            guardian_cnic=guardian_cnic,
            guardian_profession=guardian_profession,

            mother_name=mother_name,
            mother_cnic=mother_cnic,
            mother_contact=mother_contact,
            mother_profession=mother_profession,

            # Address
            address=address,

            # Academic Information
            enrollment_year=enrollment_year,
            shift=shift,
            campus=campus,
            current_grade=current_grade,
            section=section,

            # Previous School Information
            last_school_name=last_school,
            last_class_passed=last_class_passed,
            old_gr_number=old_gr_number,

            # Family Information
            family_income=family_income,
            house_owned=house_owned,
            rent_amount=rent_amount,
            zakat_status=zakat_status,

            # Siblings Information
            sibling_in_alkhair=sibling_in_alkhair,
            father_status=father_status,

            # System Fields
            is_draft=False
        )

        # Assign classroom if grade and section are provided
        if current_grade and section and shift:
            self.assign_classroom_to_student(student, campus, current_grade, section, shift)

        return student

    def assign_classroom_to_student(self, student, campus, grade_name, section, shift):
        """Assign classroom to student based on grade, section, and shift"""
        try:
            # Map grade names to Roman numerals
            grade_mapping = {
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
                'KG-1': 'KG-I',
                'KG-2': 'KG-II',
                'KG1': 'KG-I',
                'KG2': 'KG-II',
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
            
            # Assign classroom to student
            student.classroom = classroom
            self.stdout.write(f"✅ Assigned classroom: {mapped_grade_name}-{section} to {student.name}")
            
        except Exception as e:
            self.stdout.write(f"❌ Error assigning classroom: {str(e)}")

    def clean_text(self, text):
        """Clean and normalize text data"""
        if not text or text.strip() in ['000', '0000', 'nil', 'N/A', 'No', '########']:
            return ''
        return text.strip()

    def clean_cnic(self, cnic):
        """Clean and validate CNIC"""
        if not cnic or cnic.strip() in ['000', '0000', 'nil', 'N/A', '########']:
            return ''
        
        # Handle scientific notation (e.g., 4.21E+12)
        try:
            if 'E+' in str(cnic):
                cnic = str(int(float(cnic)))
        except:
            pass
        
        # Remove any non-digit characters except hyphens
        cleaned = re.sub(r'[^\d-]', '', str(cnic).strip())
        
        # Validate CNIC format (should be 13 digits with optional hyphens)
        digits_only = re.sub(r'-', '', cleaned)
        if len(digits_only) == 13 and digits_only.isdigit():
            return cleaned
        else:
            return str(cnic).strip()  # Return original if validation fails

    def clean_phone(self, phone):
        """Clean and validate phone number"""
        if not phone or phone.strip() in ['000', '0000', 'nil', 'N/A', '########']:
            return ''
        
        # Handle scientific notation (e.g., 3.14E+09)
        try:
            if 'E+' in str(phone):
                phone = str(int(float(phone)))
        except:
            pass
        
        # Remove any non-digit characters
        cleaned = re.sub(r'[^\d]', '', str(phone).strip())
        
        # Validate phone format (should be 11 digits starting with 03)
        if len(cleaned) == 11 and cleaned.startswith('03'):
            return cleaned
        else:
            return str(phone).strip()  # Return original if validation fails

    def parse_date(self, date_str):
        """Parse various date formats"""
        if not date_str or date_str.strip() in ['000', '0000', 'nil', 'N/A', '########']:
            return None

        date_str = date_str.strip()
        
        # Common date formats to try
        date_formats = [
            '%d/%m/%Y',      # 28/07/1993
            '%d-%m-%Y',      # 28-07-1993
            '%Y-%m-%d',      # 1993-07-28
            '%d-%m-%y',      # 28-07-93
            '%d/%m/%y',      # 28/07/93
            '%m/%d/%Y',      # 07/28/1993
            '%m-%d-%Y',      # 07-28-1993
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
        if not year_str or year_str.strip() in ['000', '0000', 'nil', 'N/A', '########']:
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
            'f': 'female'
        }
        return gender_map.get(gender_str, 'male')  # Default to male

    def map_shift(self, shift_str):
        """Map shift string to model choice"""
        shift_map = {
            'morning': 'morning',
            'afternoon': 'afternoon'
        }
        return shift_map.get(shift_str, 'morning')  # Default to morning

    def parse_decimal(self, value_str):
        """Parse decimal value from string"""
        if not value_str or value_str.strip() in ['000', '0000', 'nil', 'N/A', '########']:
            return None
        
        try:
            # Remove commas and convert to decimal
            cleaned = value_str.replace(',', '').strip()
            return float(cleaned)
        except (ValueError, TypeError):
            return None

    def parse_boolean(self, value_str):
        """Parse boolean value from string"""
        if not value_str:
            return False
        
        value_str = value_str.strip().lower()
        return value_str in ['yes', 'y', '1', 'true', 'owned']

    def map_zakat_status(self, status_str):
        """Map zakat status string to model choice"""
        if not status_str:
            return None
        
        status_str = status_str.strip().lower()
        status_map = {
            'applicable': 'applicable',
            'not applicable': 'not_applicable',
            'not_applicable': 'not_applicable'
        }
        return status_map.get(status_str, 'not_applicable')

    def map_yes_no(self, value_str):
        """Map yes/no string to model choice"""
        if not value_str:
            return None
        
        value_str = value_str.strip().lower()
        return 'yes' if value_str in ['yes', 'y', '1', 'true'] else 'no'

    def map_father_status(self, status_str):
        """Map father status string to model choice"""
        if not status_str:
            return None
        
        status_str = status_str.strip().lower()
        status_map = {
            'alive': 'alive',
            'dead': 'dead'
        }
        return status_map.get(status_str, 'alive')

    def resolve_csv_path(self, file_path):
        """Resolve CSV file path by checking multiple locations"""
        # Check if file exists as provided
        if os.path.exists(file_path):
            return os.path.abspath(file_path)
        
        # Check in backend directory (where manage.py is)
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        backend_path = os.path.join(backend_dir, file_path)
        if os.path.exists(backend_path):
            return os.path.abspath(backend_path)
        
        # Check with just filename in backend directory
        filename = os.path.basename(file_path)
        filename_in_backend = os.path.join(backend_dir, filename)
        if os.path.exists(filename_in_backend):
            return os.path.abspath(filename_in_backend)
        
        # Try case-insensitive search in backend directory
        if os.path.isdir(backend_dir):
            provided_lower = filename.lower()
            for file in os.listdir(backend_dir):
                if file.lower().endswith('.csv'):
                    file_lower = file.lower()
                    # Normalize plural/singular for matching
                    provided_normalized = provided_lower.replace('students', 'student')
                    file_normalized = file_lower.replace('students', 'student')
                    # Check if they match (allowing for minor differences)
                    if (provided_normalized in file_normalized or 
                        file_normalized in provided_normalized or
                        provided_lower == file_lower):
                        return os.path.abspath(os.path.join(backend_dir, file))
        
        return None
