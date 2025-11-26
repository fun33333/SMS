from django.db import models, transaction
from campus.models import Campus
from teachers.models import Teacher
from coordinator.models import Coordinator
from principals.models import Principal


class IDGenerator:
    @staticmethod
    def get_shift_code(shift):
        """Convert shift to code"""
        shift_map = {
            'morning': 'M',
            'afternoon': 'A', 
            'both': 'B',        # Morning + Afternoon
            'all': 'ALL'        # All shifts
        }
        return shift_map.get(shift.lower(), 'M')

    @staticmethod
    def get_role_code(role):
        """Convert role to code"""
        role_map = {
            'teacher': 'T',
            'coordinator': 'C',
            'principal': 'P',
            'superadmin': 'S'
        }
        return role_map.get(role.lower(), 'T')
    
    @staticmethod
    def get_campus_code_from_id(campus_id):
        """Convert campus ID to campus code format"""
        try:
            campus = Campus.objects.get(id=campus_id)
            return campus.campus_code
        except Campus.DoesNotExist:
            return f"C{campus_id:02d}"  # Fallback to old format
    
    @staticmethod
    def generate_employee_code(campus_id, shift, year, role, entity_id):
        """Generate employee code: C01-M-25-P-0001"""
        campus_code = IDGenerator.get_campus_code_from_id(campus_id)
        shift_code = IDGenerator.get_shift_code(shift)
        role_code = IDGenerator.get_role_code(role)
        year_short = str(year)[-2:]  # Last 2 digits of year
        
        return f"{campus_code}-{shift_code}-{year_short}-{role_code}-{entity_id:04d}"
    
    @staticmethod
    def _extract_suffix_numbers(codes):
        """
        Helper: extract numeric suffix from codes like C01-M-25-P-0001 -> 1.
        Returns a list of integers (may be empty).
        """
        numbers = []
        for code in codes:
            if code and "-" in code:
                try:
                    number_part = code.split("-")[-1]
                    if number_part.isdigit():
                        numbers.append(int(number_part))
                except (ValueError, IndexError):
                    continue
        return numbers

    @staticmethod
    def get_next_employee_number(role):
        """
        Get next available employee number for a given ROLE (global, not per campus).

        Requirements:
        - Each role has its own continuous global series:
          * All teachers:    ...T-0001, T-0002, T-0003, ...
          * All coordinators:...C-0001, C-0002, ...
          * All principals:  ...P-0001, P-0002, ...
        - Existing data is respected: on first run we seed the counter from
          the current max suffix for that role, then continue from there.
        """
        from services.models import GlobalCounter

        role = (role or "").lower()
        key = f"employee_{role}"  # e.g. employee_teacher, employee_principal

        with transaction.atomic():
            counter, _ = GlobalCounter.objects.select_for_update().get_or_create(
                key=key,
                defaults={"value": 0},
            )

            # If this counter is brand new (or still zero), seed it from existing data
            if counter.value == 0:
                if role == "teacher":
                    existing_codes = Teacher.objects.filter(
                        employee_code__isnull=False
                    ).values_list("employee_code", flat=True)
                elif role == "coordinator":
                    existing_codes = Coordinator.objects.filter(
                        employee_code__isnull=False
                    ).values_list("employee_code", flat=True)
                elif role == "principal":
                    existing_codes = Principal.objects.filter(
                        employee_code__isnull=False
                    ).values_list("employee_code", flat=True)
                else:
                    existing_codes = []

                numbers = IDGenerator._extract_suffix_numbers(existing_codes)
                # Seed with current max so next number continues the series
                counter.value = max(numbers) if numbers else 0

            # Increment and return the new value
            counter.value = counter.value + 1
            counter.save(update_fields=["value"])
            return counter.value

    @staticmethod
    def generate_unique_employee_code(campus, shift, year, role):
        """Generate unique employee code with validation"""
        try:
            # Use campus ID instead of campus_code
            campus_id = campus.id
            if not campus_id:
                raise ValueError("Campus ID is required")
            
            # Get next available number for this ROLE (global series)
            next_number = IDGenerator.get_next_employee_number(role)
            
            # Generate code
            employee_code = IDGenerator.generate_employee_code(campus_id, shift, year, role, next_number)
            
            # Double check uniqueness
            if (Teacher.objects.filter(employee_code=employee_code).exists() or
                Coordinator.objects.filter(employee_code=employee_code).exists() or
                Principal.objects.filter(employee_code=employee_code).exists()):
                # If somehow still exists, try next number
                next_number += 1
                employee_code = IDGenerator.generate_employee_code(campus_id, shift, year, role, next_number)
            
            return employee_code
            
        except Exception as e:
            raise ValueError(f"Failed to generate employee code: {str(e)}")

    @staticmethod
    def generate_superadmin_code():
        """Generate super admin employee code without campus dependency"""
        try:
            # Get next super admin number
            next_number = IDGenerator.get_next_superadmin_number()
            
            # Generate code: S-25-0001 (Super Admin - Year - Number)
            year_short = str(2025)[-2:]  # Current year
            employee_code = f"S-{year_short}-{next_number:04d}"
            
            return employee_code
            
        except Exception as e:
            raise ValueError(f"Failed to generate super admin code: {str(e)}")
    
    @staticmethod
    def get_next_superadmin_number():
        """Get next available super admin number"""
        try:
            from users.models import User
            
            # Get all existing super admin codes
            super_admins = User.objects.filter(
                role='superadmin',
                username__startswith='S-'
            ).values_list('username', flat=True)
            
            # Extract numbers from existing codes
            numbers = []
            for code in super_admins:
                if code and '-' in code:
                    try:
                        # Extract last part (number) from code like S-25-0001
                        number_part = code.split('-')[-1]
                        if number_part.isdigit():
                            numbers.append(int(number_part))
                    except (ValueError, IndexError):
                        continue
            
            # Return next available number
            if not numbers:
                return 1
            
            return max(numbers) + 1
            
        except Exception as e:
            print(f"Error getting next super admin number: {str(e)}")
            return 1

    @staticmethod
    def generate_unique_student_code(classroom, year):
        """Generate unique student code for classroom"""
        pass