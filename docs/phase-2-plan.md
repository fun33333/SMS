# Phase 2 Delivery Plan — IAK-SMS

_Version 1.0 — November 2025_

## 1. Executive Summary

- **Goal**: extend IAK-SMS beyond attendance by delivering four fully operational domains (Request Management, Student Transfers, Result Management, Timetable Service) with pervasive real-time notifications and optimized APIs.
- **Guiding Principles**: DRY + SOLID, layered architecture (controllers → services → repositories → models), microservices with clear boundaries, real-time via Kafka + Redis + WebSockets, official folder structures (Next.js App Router, Django/FastAPI services), high adoption focus.
- **Phase 1 Alignment**: attendance workflows stay authoritative. Phase 2 services listen to the same event backbone and reuse existing infra (Celery, Redis, Kafka, Docker/K8s, CI/CD).
- **Key Outcomes**:
  1. Every action—large or small—emits an event and produces a user-facing notification with progress visibility.
  2. API surface is consolidated, cached, and orchestrated to cut redundant calls in both Phase 1 and Phase 2 UX.
  3. Detailed documentation (this file) becomes the single source of truth for implementation and rollout.

## 2. Architecture Overview

### 2.1 Service Map

| Service | Tech | Responsibilities | Key Topics/Queues |
| --- | --- | --- | --- |
| Attendance (existing) | Django + Celery | Capture/check attendance, coordinator workflows | `attendance.events` |
| **Request Management** | Django/FastAPI | Teacher/staff issue lifecycle, SLA automation | `requests.events` |
| **Student Transfer** | Django | Campus/class transfer approvals, enrollment sync | `transfers.events` |
| **Result Management** | Django | Grade entry, moderation, publishing | `results.events` |
| **Timetable Service** | FastAPI + Scheduler Engine | Teacher/classroom scheduling, conflict detection | `timetables.events` |
| **Notification Service** | FastAPI worker + Redis | Consume events, enrich, push notifications via Redis pub/sub + WebSockets | `notifications.dispatch` |
| **API Gateway/BFF** | FastAPI | Aggregate domain APIs, caching, auth, pagination | N/A |

### 2.2 Data Stores & Infra

- Postgres schemas per service; shared master data schema (`teachers`, `subjects`, `campuses`, `classrooms`, `programs`, `sessions`).
- Redis:
  - Pub/Sub channels per domain (e.g., `notifications:requests`, `notifications:timetable`).
  - Caches for timetable snapshots, dashboard aggregates, request counts.
- Kafka:
  - Topic per service plus DLQs.
  - Event schema registry (Avro/JSON) stored in `infra/events/`.
- Celery:
  - Background jobs for heavy tasks (grade imports, timetable recompute, notification retries).
- Observability:
  - OpenTelemetry tracing, Prometheus metrics, Loki/ELK logs.
- Deployment:
  - Dockerfile + Helm chart for each service.
  - CI/CD (GitHub Actions/Azure DevOps) runs lint → test → build → push → helm upgrade.

### 2.3 Layered Pattern (per service)

```text
controllers/ (REST + GraphQL endpoints)
services/    (business rules, orchestration)
repositories/(ORM queries, caching hooks)
models/      (pydantic/dataclasses + DB models)
events/      (publish/consume, schema contracts)
```

## 3. Notification Blueprint

### 3.1 Core Requirements

- **Every action produces a notification**:
  - Creation, updates, comments, reassignments, approvals, publish/unpublish, timetable adjustments, even granular changes (e.g., “Time slot swapped”).
- **Audience Scoping**: notifications sent to all stakeholders “in the loop” (originator, assigned coordinator, affected teachers/students).
- **Delivery Channels**: in-app toast, notification inbox, badge counts, optional email/SMS (future).
- **Progress Visualization**: timeline component fed by event history (same data as notifications) for transparency.

### 3.2 Event Flow

1. Controller triggers service logic.
2. Service emits domain event to Kafka with metadata (actor, entity, action, payload diff).
3. Notification service consumes event:
   - Applies templates + localization.
   - Stores notification row (status, recipients, context).
   - Publishes to Redis pub/sub channels.
4. WebSocket gateway pushes to connected clients.
5. Clients update UI (toast + list) using TanStack Query cache invalidation.

### 3.3 Notification Templates

| Domain | Action | Message Example | Priority |
| --- | --- | --- | --- |
| Request | Status change | “Request #REQ-239 moved to _In Progress_ by Sana.” | Medium |
| Request | Comment | “New comment on Request #REQ-239 from Ahmed.” | Low |
| Transfer | Approval | “Transfer #TR-101 approved by Registrar. Effective 05 Dec.” | High |
| Result | Publish | “Midterm result for Physics 101 published.” | High |
| Timetable | Slot change | “Class 8-B Math moved to Room 204 at 10:00.” | Medium |

### 3.4 UX Integration

- Notification Bell (`frontend/src/components/admin/notification-bell.tsx`) reuses Socket hook; add domain filters & progress timeline link.
- Admin dashboards show “Activity Stream” component pulling from `/notifications/feed`.
- Per-page toasts triggered via WebSocket events to avoid extra API calls.

## 4. API Optimization Strategy

### 4.1 Current Pain

- Multiple sequential fetches per page (e.g., coordinator dashboard hitting attendance, requests, stats individually).
- No aggregation or caching; redundant identical requests per navigation.

### 4.2 Target Architecture

1. **API Gateway/BFF**:
   - Aggregates service responses, handles fan-out server-side.
   - Implements route-level caching (Redis) with TTL + cache bust via events.
   - Exposes optimized endpoints per UI screen (e.g., `/dashboard/coordinator` returns attendance summary + pending requests + timetable alerts).
2. **Event-Driven Projections**:
   - Kafka consumers populate read-optimized tables (“materialized views”) for high-traffic queries.
   - Examples: request counts by status, timetable snapshots by teacher, result summaries.
3. **Client Optimization**:
   - WebSockets for live updates to avoid polling.
   - HTTP/2 keep-alive + gzip; use query batching (TanStack Query `useQueries` replaced by single fetch).
   - ETags + `If-None-Match` for data unlikely to change frequently (master data, timetable templates).
4. **Background Jobs**:
   - Long-running operations (bulk result import, timetable regeneration) moved to Celery tasks.
   - Clients get task IDs, poll `/jobs/{id}` or subscribe to WebSocket notifications.
5. **Monitoring**:
   - API latency dashboards per route.
   - Error budgets + rate limits defined in gateway.

### 4.3 Implementation Checklist

- [ ] Introduce `gateway/` service with per-route caching middleware.
- [ ] Refactor frontend pages to consume new aggregate endpoints.
- [ ] Add Redis cache keys naming convention (`cache:dashboard:{role}:{filters}`).
- [ ] Document caching policy in OpenAPI spec.
- [ ] Add load tests (k6/Locust) for aggregated endpoints.

## 5. Domain Specifications

### 5.1 Request Management Service

**Use Cases**
- Submit request (teacher/staff).
- Auto-triage & assignment.
- Update status, comment, attach evidence.
- Escalate & resolve with SLA tracking.

**Data Model Highlights**
- `Request`: id, type, priority, requestor_id, assigned_to, status, sla_due_at, context (course/campus), created_at, updated_at.
- `RequestHistory`: request_id, actor_id, action, metadata, created_at.
- `Attachment`: request_id, file_url, uploaded_by.

**APIs**
- `POST /requests` – create; returns event + notification.
- `GET /requests/dashboard` – aggregated counts, latest items (cached).
- `PATCH /requests/{id}` – update status/assignee; emits `request.updated`.
- `POST /requests/{id}/comments`.
- `GET /requests/{id}/timeline` – history for progress view (served from notification history).

**Notifications**
- On create, assignment, status change, comment, SLA breach warnings.

### 5.2 Student Transfer Service

**Use Cases**
- Initiate transfer (admin/coordinator).
- Multi-step approvals (academic head → registrar).
- Automatic checks (capacity, fees clearance, attendance threshold).
- Apply transfer and sync attendance/enrollment.

**Data Model Highlights**
- `TransferRequest`: student_id, from_campus, to_campus, from_class, to_class, reason, status, effective_date.
- `ApprovalStep`: transfer_id, role, approver_id, status, comment.
- `TransferAudit`: event log for compliance.

**APIs**
- `POST /transfers` – submit; returns validation errors if constraints fail.
- `GET /transfers/pending?role=...` – filtered queue for approvers.
- `POST /transfers/{id}/approve` – records step, emits `transfer.step.completed`.
- `POST /transfers/{id}/apply` – final enrollment sync (background job + event).

**Notifications**
- Student + originating coordinator get updates at each step.
- Teachers linked to affected classes alerted post-transfer.

### 5.3 Result Management Service

**Use Cases**
- Create assessments, enter grades, request moderation, publish results, allow re-open.

**Data Model Highlights**
- `Assessment`: course_id, term, weight, grading_schema.
- `ResultEntry`: student_id, assessment_id, marks, status (draft/published), moderated_by.
- `ResultVersion`: version history for audit.

**APIs**
- `POST /results/assessments`.
- `POST /results/entries/bulk` (async job).
- `PATCH /results/entries/{id}`.
- `POST /results/publish` – publishes set, emits `results.published`.
- `GET /results/summary?course=...` – precomputed view.

**Notifications**
- Teachers notified on moderation actions.
- Students notified when results published/unpublished.
- Admins alerted on anomalies (e.g., missing marks).

### 5.4 Timetable Service

**Use Cases**
- CRUD timetable templates, assign teachers/rooms, detect conflicts, push temporary changes.

**Data Model Highlights**
- `TimetableTemplate`: program_id, session_id, valid_from, valid_to.
- `Timeslot`: day, start_time, end_time, subject_id, teacher_id, room_id.
- `Override`: date-specific change (substitution, cancellation).

**APIs**
- `POST /timetables/templates`.
- `POST /timetables/{id}/generate` – runs scheduler (async).
- `GET /timetables/teacher/{teacherId}` – cached snapshot.
- `POST /timetables/{id}/override`.

**Notifications**
- Teachers/students alerted on overrides or assignments.
- Attendance service listens to timetable events for validation.

## 6. Data Requirements

- Master Data audits for: teachers, students, classes, campuses, classrooms (capacity, equipment), subjects, academic sessions, holidays.
- Access control matrix (roles vs permissions) updated for new services.
- Notification templates + translation keys stored centrally.
- SLA rules (per request type), transfer constraints, grading scales, timetable policies.

## 7. Deployment & DevOps

- **Dockerfiles**:
  - Multi-stage builds (lint/test → runtime).
  - ENV parity between dev/stage/prod via `.env` + K8s secrets.
- **Helm Charts**:
  - Values for replicas, autoscaling, resource requests.
  - Kafka topics + Redis credentials as config maps/secrets.
- **CI/CD Enhancements**:
  - Lint/test for new services.
  - Contract tests between API Gateway and downstream services.
  - Security scans (Snyk/Trivy) on containers.
- **Observability**:
  - Dashboards per service (latency, throughput, errors).
  - Notification delivery metrics (sent, failed, retry count).

## 8. Testing & Rollout Plan

1. **Unit + Integration Tests** per service (pytest/Django test runner, coverage targets ≥85%).
2. **Contract Tests** using Pact between gateway and services.
3. **Load Tests** (k6/Locust) focusing on aggregated dashboard endpoints and notification throughput.
4. **WebSocket Regression Suite** ensuring all event types reach clients.
5. **UAT**:
   - Scenarios for each domain with scripted data.
   - Stakeholder sign-off (coordinators, teachers, registrar).
6. **Rollout Strategy**:
   - Staged deployment (shadow mode) to let data flow while UI hidden.
   - Feature flags in frontend to toggle new modules.
   - Training sessions + quickstart guides to boost adoption beyond Phase 1 experience.

## 9. Next Steps & Responsibilities

| Step | Owner | Due | Notes |
| --- | --- | --- | --- |
| Confirm business rules & master data gaps | Product + SMEs | 18 Nov | Required before schema freeze |
| Finalize API + event specs (OpenAPI + AsyncAPI) | Backend | 22 Nov | Store under `docs/apis/` |
| Wireframes for new flows | UX | 24 Nov | High-fidelity for admin, teacher, student portals |
| Implement Notification Service + Gateway | Platform team | Sprint 1 | Blocks all UI work |
| Deliver domain services incrementally | Feature squads | Sprint 2+ | Follow priority order (Requests → Transfers → Results → Timetable) |
| QA + UAT | QA + Stakeholders | After each sprint | Include performance + WebSocket tests |
| Production rollout & adoption tracking | Ops + Training | Post-UAT | Provide walkthroughs, collect feedback |

---

_This document will guide development, QA, and rollout for Phase 2. Any change requests should update this file so the entire team stays aligned._

