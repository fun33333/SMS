# Database Migration Strategy

## 🎯 Goal

Migrate from single monolithic database to multiple databases (one per service) with zero downtime and data consistency.

## 📊 Current Database Structure

### Single PostgreSQL Database
- All tables in one database
- Shared foreign keys
- Direct joins between tables

### Target: Database per Service
- Each service has its own database
- No direct foreign keys across databases
- Communication via events/APIs

## 🔄 Migration Strategy

### Phase 1: Database Replication (Read-Only)

**Goal**: Services can read from main DB while we prepare for migration.

#### Setup Logical Replication

```sql
-- On main database (source)
-- Enable logical replication
ALTER SYSTEM SET wal_level = logical;
SELECT pg_reload_conf();

-- Create publication
CREATE PUBLICATION main_publication FOR ALL TABLES;

-- On service database (target)
-- Create subscription
CREATE SUBSCRIPTION student_subscription
CONNECTION 'host=main-db port=5432 dbname=main_db user=replicator password=xxx'
PUBLICATION main_publication
WITH (copy_data = true);
```

**Benefits**:
- Services can read latest data
- No impact on main database writes
- Can test service logic with real data

---

### Phase 2: Dual-Write Period

**Goal**: Write to both databases, gradually shift reads.

#### Implementation

```python
# In monolithic app
def create_student(data):
    # Write to main DB (existing)
    student = Student.objects.using('default').create(**data)
    
    # Also write to Student Service DB
    try:
        student_service_client.create_student(data)
    except Exception as e:
        # Log error but don't fail
        logger.error(f"Failed to write to student service: {e}")
    
    return student
```

#### Gradual Read Migration

```python
# Week 1: 10% reads from service DB
if random.random() < 0.1:
    student = Student.objects.using('student_db').get(id=id)
else:
    student = Student.objects.using('default').get(id=id)

# Week 2: 50% reads
# Week 3: 100% reads
```

---

### Phase 3: Data Migration

#### Step 1: Export Data

```bash
# Export students table
pg_dump -h main-db -U postgres -d main_db \
  -t students \
  --data-only \
  --inserts > students_data.sql
```

#### Step 2: Transform Data

```python
# Remove foreign keys, keep only IDs
# Transform data format if needed
# Clean up data
```

#### Step 3: Import to Service DB

```bash
# Import to student service DB
psql -h student-db -U postgres -d student_db < students_data.sql
```

#### Step 4: Verify Data

```sql
-- Compare row counts
SELECT COUNT(*) FROM main_db.students;
SELECT COUNT(*) FROM student_db.students;

-- Compare sample data
SELECT * FROM main_db.students LIMIT 10;
SELECT * FROM student_db.students LIMIT 10;
```

---

### Phase 4: Cutover

#### Step 1: Stop Dual-Write

```python
# Remove dual-write code
# Only write to service DB
def create_student(data):
    student = Student.objects.using('student_db').create(**data)
    return student
```

#### Step 2: Update All Reads

```python
# Change all queries to use service DB
Student.objects.using('student_db').all()
```

#### Step 3: Remove Replication

```sql
-- Drop subscription
DROP SUBSCRIPTION student_subscription;
```

---

## 🗄️ Database Schema Design

### Shared IDs Strategy

#### Use UUIDs for Cross-Service References

```python
# In Student Service
class Student(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    user_id = models.UUIDField()  # Reference to User Service
    campus_id = models.UUIDField()  # Reference to Academic Service
    classroom_id = models.UUIDField()  # Reference to Academic Service
```

**Benefits**:
- No foreign key constraints
- Services are independent
- Can reference entities in other services

### Data Denormalization

#### Store Copies of Related Data

```python
# In Student Service, store campus name (denormalized)
class Student(models.Model):
    campus_id = models.UUIDField()
    campus_name = models.CharField(max_length=255)  # Denormalized
    
    # Update via events
    def update_campus_name(self, name):
        self.campus_name = name
        self.save()
```

**When Campus Updates**:
1. Academic Service publishes `campus.updated` event
2. Student Service consumes event
3. Updates all students with that campus_id

---

## 🔄 Event-Driven Data Sync

### Example: Student Enrollment

#### Step 1: Student Service Creates Student

```python
# student-service/views.py
def create_student(request):
    student = Student.objects.create(**data)
    
    # Publish event
    kafka_producer.send('student.created', {
        'student_id': str(student.id),
        'user_id': str(student.user_id),
        'campus_id': str(student.campus_id),
        'classroom_id': str(student.classroom_id),
    })
    
    return Response(student_data)
```

#### Step 2: Other Services Consume Event

```python
# attendance-service/consumers.py
@kafka_consumer.subscribe('student.created')
def handle_student_created(event):
    # Create attendance record for student
    AttendanceRecord.objects.create(
        student_id=event['student_id'],
        # ... other fields
    )
```

```python
# notification-service/consumers.py
@kafka_consumer.subscribe('student.created')
def handle_student_created(event):
    # Send welcome notification
    send_welcome_notification(event['user_id'])
```

---

## 📋 Database per Service

### Auth Service Database (`auth_db`)

```sql
CREATE DATABASE auth_db;

-- Tables
CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(150) UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(50),
    is_active BOOLEAN,
    created_at TIMESTAMP
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    token TEXT,
    expires_at TIMESTAMP,
    blacklisted BOOLEAN
);

CREATE TABLE password_change_otp (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    otp_code VARCHAR(6),
    expires_at TIMESTAMP,
    is_used BOOLEAN
);
```

### Student Service Database (`student_db`)

```sql
CREATE DATABASE student_db;

-- Tables
CREATE TABLE students (
    id UUID PRIMARY KEY,
    user_id UUID,  -- Reference to Auth Service
    name VARCHAR(255),
    email VARCHAR(255),
    campus_id UUID,  -- Reference to Academic Service
    classroom_id UUID,  -- Reference to Academic Service
    campus_name VARCHAR(255),  -- Denormalized
    -- ... other fields
    created_at TIMESTAMP
);

CREATE TABLE student_status (
    id UUID PRIMARY KEY,
    student_id UUID REFERENCES students(id),
    status VARCHAR(50),
    updated_at TIMESTAMP
);
```

### Academic Service Database (`academic_db`)

```sql
CREATE DATABASE academic_db;

-- Tables
CREATE TABLE campuses (
    id UUID PRIMARY KEY,
    campus_name VARCHAR(255),
    campus_code VARCHAR(50) UNIQUE,
    -- ... other fields
);

CREATE TABLE levels (
    id UUID PRIMARY KEY,
    name VARCHAR(255),
    code VARCHAR(50),
    campus_id UUID REFERENCES campuses(id)
);

CREATE TABLE grades (
    id UUID PRIMARY KEY,
    name VARCHAR(255),
    level_id UUID REFERENCES levels(id)
);

CREATE TABLE classrooms (
    id UUID PRIMARY KEY,
    grade_id UUID REFERENCES grades(id),
    section VARCHAR(10),
    shift VARCHAR(20),
    code VARCHAR(50) UNIQUE
);
```

---

## 🔐 Database Security

### Connection Strings

```python
# Use environment variables
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME'),
        'USER': os.getenv('DB_USER'),
        'PASSWORD': os.getenv('DB_PASSWORD'),
        'HOST': os.getenv('DB_HOST'),
        'PORT': os.getenv('DB_PORT'),
    }
}
```

### Kubernetes Secrets

```yaml
# Create secret
apiVersion: v1
kind: Secret
metadata:
  name: student-db-secret
type: Opaque
stringData:
  DB_NAME: student_db
  DB_USER: student_user
  DB_PASSWORD: secure_password
  DB_HOST: student-db-service
  DB_PORT: "5432"
```

```yaml
# Use in deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: student-service
spec:
  template:
    spec:
      containers:
      - name: student-service
        envFrom:
        - secretRef:
            name: student-db-secret
```

---

## 📊 Data Consistency

### Eventual Consistency Model

**Principle**: Accept that data might be temporarily inconsistent across services.

**Example**:
1. Student enrolled → Student Service
2. Event published → `student.enrolled`
3. Attendance Service receives event (might be delayed)
4. Temporary inconsistency: Student exists but no attendance record yet
5. Eventually consistent: Attendance record created

### Handling Inconsistencies

#### Option 1: Retry Mechanism

```python
@kafka_consumer.subscribe('student.created')
def handle_student_created(event):
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # Try to get student from Student Service
            student = student_service_client.get_student(event['student_id'])
            # Create attendance record
            AttendanceRecord.objects.create(...)
            break
        except Exception as e:
            if attempt == max_retries - 1:
                # Log error, send to dead letter queue
                logger.error(f"Failed after {max_retries} attempts: {e}")
            else:
                time.sleep(2 ** attempt)  # Exponential backoff
```

#### Option 2: Saga Pattern (for distributed transactions)

```python
# For complex operations requiring multiple services
def transfer_student(student_id, new_classroom_id):
    # Step 1: Update Student Service
    student = student_service.update_classroom(student_id, new_classroom_id)
    
    # Step 2: Update Attendance Service
    try:
        attendance_service.transfer_student(student_id, new_classroom_id)
    except Exception:
        # Compensate: Rollback student update
        student_service.rollback_classroom(student_id)
        raise
    
    # Step 3: Update Result Service
    try:
        result_service.transfer_student(student_id, new_classroom_id)
    except Exception:
        # Compensate: Rollback both
        attendance_service.rollback_transfer(student_id)
        student_service.rollback_classroom(student_id)
        raise
```

---

## 🧪 Testing Database Migration

### Test Script

```python
# test_migration.py
def test_data_migration():
    # 1. Export from main DB
    main_students = Student.objects.using('default').all()
    
    # 2. Import to service DB
    for student in main_students:
        Student.objects.using('student_db').create(
            id=student.id,
            name=student.name,
            # ... other fields
        )
    
    # 3. Verify
    main_count = Student.objects.using('default').count()
    service_count = Student.objects.using('student_db').count()
    
    assert main_count == service_count, "Count mismatch"
    
    # 4. Compare sample data
    main_sample = Student.objects.using('default').first()
    service_sample = Student.objects.using('student_db').get(id=main_sample.id)
    
    assert main_sample.name == service_sample.name
```

---

## ✅ Migration Checklist

### For Each Service:

- [ ] Create service database
- [ ] Setup database replication (read-only)
- [ ] Export data from main DB
- [ ] Transform data (remove foreign keys, add UUIDs)
- [ ] Import data to service DB
- [ ] Verify data integrity
- [ ] Setup dual-write in monolithic app
- [ ] Gradually shift reads to service DB
- [ ] Test service with new database
- [ ] Stop dual-write, only write to service DB
- [ ] Remove replication subscription
- [ ] Update all queries to use service DB
- [ ] Remove old database code

---

## 🚨 Rollback Plan

### If Migration Fails

1. **Stop dual-write**: Only write to main DB
2. **Revert reads**: Read from main DB
3. **Drop service database**: Clean up
4. **Investigate issue**: Fix problems
5. **Retry migration**: Start over

### Data Recovery

```bash
# Restore from backup
pg_restore -h main-db -U postgres -d main_db backup.dump

# Or restore service DB
pg_restore -h student-db -U postgres -d student_db backup.dump
```

