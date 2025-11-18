# Microservices Architecture Design

## 🏛️ Service Boundaries

### 1. Auth Service
**Responsibility**: Authentication & Authorization only

**Endpoints**:
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout (blacklist token)
- `POST /api/auth/change-password` - Change password
- `POST /api/auth/reset-password` - Reset password
- `POST /api/auth/send-otp` - Send OTP
- `POST /api/auth/verify-otp` - Verify OTP
- `GET /api/auth/validate-token` - Validate JWT token

**Database**: `auth_db`
- `users` table (minimal: id, username, email, password_hash, role, is_active)
- `refresh_tokens` table (blacklist)
- `password_change_otp` table

**Events Published**:
- `user.authenticated`
- `user.password_changed`

**Events Consumed**:
- `user.created` (from User Service)

**Dependencies**: None (most independent service)

---

### 2. User Management Service
**Responsibility**: User CRUD, Profile Management

**Endpoints**:
- `GET /api/users/` - List users
- `GET /api/users/{id}/` - Get user
- `POST /api/users/` - Create user
- `PUT /api/users/{id}/` - Update user
- `DELETE /api/users/{id}/` - Delete user
- `GET /api/users/current/` - Current user profile
- `GET /api/users/check-email/` - Check email exists

**Database**: `user_db`
- `users` table (full profile)
- `user_profiles` table
- `user_permissions` table

**Events Published**:
- `user.created`
- `user.updated`
- `user.deleted`

**Events Consumed**:
- None (creates users, Auth Service listens)

**Dependencies**: Auth Service (for token validation)

---

### 3. Student Service
**Responsibility**: Student Management

**Endpoints**:
- `GET /api/students/` - List students
- `GET /api/students/{id}/` - Get student
- `POST /api/students/` - Create student
- `PUT /api/students/{id}/` - Update student
- `DELETE /api/students/{id}/` - Delete student
- `GET /api/students/stats/` - Statistics
- `GET /api/students/classroom/{classroom_id}/` - Students by classroom

**Database**: `student_db`
- `students` table
- `student_status` table
- `student_enrollments` table

**Events Published**:
- `student.created`
- `student.updated`
- `student.enrolled`
- `student.transferred`

**Events Consumed**:
- `classroom.created` (from Academic Service)
- `classroom.updated` (from Academic Service)

**Dependencies**: 
- Auth Service (authentication)
- Academic Service (campus, classroom data)

---

### 4. Teacher Service
**Responsibility**: Teacher Management

**Endpoints**:
- `GET /api/teachers/` - List teachers
- `GET /api/teachers/{id}/` - Get teacher
- `POST /api/teachers/` - Create teacher
- `PUT /api/teachers/{id}/` - Update teacher
- `DELETE /api/teachers/{id}/` - Delete teacher
- `GET /api/teachers/stats/` - Statistics
- `GET /api/teachers/classroom/{classroom_id}/` - Teachers by classroom

**Database**: `teacher_db`
- `teachers` table
- `teacher_assignments` table

**Events Published**:
- `teacher.created`
- `teacher.updated`
- `teacher.assigned`

**Events Consumed**:
- `classroom.created` (from Academic Service)

**Dependencies**:
- Auth Service (authentication)
- Academic Service (campus, classroom data)

---

### 5. Attendance Service
**Responsibility**: Attendance Tracking

**Endpoints**:
- `POST /api/attendance/mark/` - Mark attendance
- `GET /api/attendance/student/{student_id}/` - Student attendance
- `GET /api/attendance/classroom/{classroom_id}/` - Classroom attendance
- `GET /api/attendance/reports/` - Attendance reports
- `GET /api/attendance/holidays/` - Holiday management

**Database**: `attendance_db`
- `attendance_records` table
- `holidays` table
- `attendance_alerts` table

**Events Published**:
- `attendance.marked`
- `attendance.alert` (for low attendance)

**Events Consumed**:
- `student.enrolled` (from Student Service)
- `classroom.created` (from Academic Service)

**Dependencies**:
- Auth Service (authentication)
- Student Service (student data)
- Academic Service (classroom data)

---

### 6. Notification Service
**Responsibility**: Real-time Notifications

**Endpoints**:
- `GET /api/notifications/` - List notifications
- `POST /api/notifications/mark-read/` - Mark as read
- `DELETE /api/notifications/{id}/` - Delete notification
- `WebSocket /ws/notifications/` - Real-time notifications

**Database**: `notification_db`
- `notifications` table
- `notification_preferences` table

**Events Published**:
- `notification.sent`
- `notification.read`

**Events Consumed**:
- `user.created`
- `student.enrolled`
- `attendance.marked`
- `request.created`
- All other service events

**Dependencies**:
- Auth Service (authentication)
- Redis (pub/sub for WebSocket)

---

### 7. Academic Service
**Responsibility**: Academic Structure (Campus, Classes, Grades)

**Endpoints**:
- `GET /api/campus/` - List campuses
- `GET /api/classes/` - List classes
- `GET /api/grades/` - List grades
- `GET /api/levels/` - List levels
- `POST /api/campus/` - Create campus
- `PUT /api/campus/{id}/` - Update campus

**Database**: `academic_db`
- `campuses` table
- `levels` table
- `grades` table
- `classrooms` table

**Events Published**:
- `campus.created`
- `classroom.created`
- `classroom.updated`

**Events Consumed**:
- None (source of truth for academic structure)

**Dependencies**:
- Auth Service (authentication)

---

### 8. Request Service
**Responsibility**: Request Management

**Endpoints**:
- `GET /api/requests/` - List requests
- `POST /api/requests/` - Create request
- `PUT /api/requests/{id}/` - Update request
- `POST /api/requests/{id}/approve/` - Approve request
- `POST /api/requests/{id}/reject/` - Reject request

**Database**: `request_db`
- `requests` table
- `request_history` table

**Events Published**:
- `request.created`
- `request.approved`
- `request.rejected`

**Events Consumed**:
- `user.created` (for request creators)

**Dependencies**:
- Auth Service (authentication)

---

### 9. Result Service
**Responsibility**: Result Management

**Endpoints**:
- `GET /api/results/student/{student_id}/` - Student results
- `POST /api/results/` - Create result
- `PUT /api/results/{id}/` - Update result
- `GET /api/results/reports/` - Result reports

**Database**: `result_db`
- `results` table
- `result_details` table

**Events Published**:
- `result.created`
- `result.updated`

**Events Consumed**:
- `student.enrolled` (from Student Service)

**Dependencies**:
- Auth Service (authentication)
- Student Service (student data)
- Academic Service (grade data)

---

### 10. Transfer Service
**Responsibility**: Transfer Management

**Endpoints**:
- `GET /api/transfers/` - List transfers
- `POST /api/transfers/` - Create transfer
- `PUT /api/transfers/{id}/` - Update transfer
- `POST /api/transfers/{id}/approve/` - Approve transfer

**Database**: `transfer_db`
- `transfers` table
- `transfer_history` table

**Events Published**:
- `transfer.created`
- `transfer.approved`
- `student.transferred`
- `teacher.transferred`

**Events Consumed**:
- `student.enrolled` (from Student Service)
- `teacher.created` (from Teacher Service)

**Dependencies**:
- Auth Service (authentication)
- Student Service
- Teacher Service
- Academic Service

---

### 11. Behaviour Service
**Responsibility**: Behaviour Management

**Endpoints**:
- `GET /api/behaviour/student/{student_id}/` - Student behaviour records
- `POST /api/behaviour/` - Create behaviour record
- `PUT /api/behaviour/{id}/` - Update behaviour record

**Database**: `behaviour_db`
- `behaviour_records` table

**Events Published**:
- `behaviour.recorded`
- `behaviour.updated`

**Events Consumed**:
- `student.enrolled` (from Student Service)

**Dependencies**:
- Auth Service (authentication)
- Student Service

---

### 12. Coordinator Service
**Responsibility**: Coordinator Management

**Endpoints**:
- `GET /api/coordinators/` - List coordinators
- `POST /api/coordinators/` - Create coordinator
- `PUT /api/coordinators/{id}/` - Update coordinator

**Database**: `coordinator_db`
- `coordinators` table
- `coordinator_assignments` table

**Events Published**:
- `coordinator.created`
- `coordinator.updated`

**Events Consumed**:
- `user.created` (from User Service)
- `classroom.created` (from Academic Service)

**Dependencies**:
- Auth Service (authentication)
- User Service
- Academic Service

---

### 13. Principal Service
**Responsibility**: Principal Management

**Endpoints**:
- `GET /api/principals/` - List principals
- `POST /api/principals/` - Create principal
- `PUT /api/principals/{id}/` - Update principal

**Database**: `principal_db`
- `principals` table

**Events Published**:
- `principal.created`
- `principal.updated`

**Events Consumed**:
- `user.created` (from User Service)
- `campus.created` (from Academic Service)

**Dependencies**:
- Auth Service (authentication)
- User Service
- Academic Service

---

## 🔄 Service Communication Patterns

### 1. Synchronous (HTTP)
- **When**: Immediate response needed
- **How**: REST API calls via API Gateway
- **Example**: Frontend → API Gateway → Student Service → Get student data

### 2. Asynchronous (Events)
- **When**: Non-critical, eventual consistency OK
- **How**: Kafka topics
- **Example**: Student Service publishes `student.enrolled` → Notification Service consumes → Send welcome email

### 3. Real-time (WebSocket)
- **When**: Live updates needed
- **How**: Redis Pub/Sub + Django Channels
- **Example**: Notification Service → Redis Pub/Sub → WebSocket → Frontend

## 🗄️ Data Consistency Strategy

### Shared IDs
- **User ID**: UUID, shared across all services
- **Campus ID**: UUID, from Academic Service
- **Classroom ID**: UUID, from Academic Service

### Eventual Consistency
- Services maintain their own copies of related data
- Updated via events
- Example: Student Service has `campus_id`, updates when `campus.updated` event received

### Saga Pattern
- For distributed transactions
- Example: Transfer student → Update Student Service → Update Attendance Service → Update Result Service
- If any step fails, rollback via compensating transactions

## 🔐 Security Architecture

### JWT Token Flow
1. User logs in → Auth Service
2. Auth Service returns JWT token
3. Frontend stores token
4. All requests include token in header
5. API Gateway validates token with Auth Service
6. Request forwarded to target service

### Service-to-Service Authentication
- **Option 1**: Service-to-service tokens (long-lived)
- **Option 2**: mTLS (mutual TLS) in Kubernetes
- **Option 3**: API keys per service

## 📊 Service Dependencies Graph

```
Auth Service (Independent)
    ↑
    │ (validates tokens)
    │
User Service ──→ Academic Service (Independent)
    │                    ↑
    │                    │
    ↓                    │
Student Service ─────────┘
    │
    ↓
Attendance Service
    │
    ↓
Result Service

Teacher Service ──→ Academic Service
    │
    ↓
Coordinator Service
    ↓
Principal Service

Notification Service (Listens to all events)
```

