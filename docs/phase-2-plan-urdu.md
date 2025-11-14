# Phase 2 Delivery Plan — IAK-SMS (Urdu Roman)

_Version 1.0 — November 2025_

## 1. Executive Summary

- **Maqsad**: attendance ke baad system ko chaar mukammal domains (Request Management, Student Transfers, Result Management, Timetable Service) tak barhana, jahan har action par real-time notification aur optimized APIs milen.
- **Asaasi Usool**: DRY + SOLID, layered architecture (controllers → services → repositories → models), clear microservice boundaries, Kafka + Redis + WebSockets se realtime, official folder structures (Next.js App Router, Django/FastAPI), adoption focus.
- **Phase 1 Alignment**: attendance workflows ab bhi source of truth. Phase 2 services wahi event backbone, Celery, Redis, Kafka, Docker/K8s, CI/CD reuse karen gi.
- **Key Outcomes**:
  1. Har choti bari action par event emit ho aur user-facing notification/progress timeline बने.
  2. Phase 1 + Phase 2 dono ke liye APIs aggregate/cached hon taake duplicate calls kam ho.
  3. Ye documentation implementation + rollout ke liye single source of truth ho.

## 2. Architecture Overview

### 2.1 Service Map

| Service | Tech | Zimmedariyan | Topics/Queues |
| --- | --- | --- | --- |
| Attendance (existing) | Django + Celery | Attendance capture, coordinator workflows | `attendance.events` |
| **Request Management** | Django/FastAPI | Teacher/staff issues, SLA automation | `requests.events` |
| **Student Transfer** | Django | Campus/class transfer approvals | `transfers.events` |
| **Result Management** | Django | Grade entry, moderation, publishing | `results.events` |
| **Timetable Service** | FastAPI + Scheduler | Scheduling, conflict detection | `timetables.events` |
| **Notification Service** | FastAPI worker + Redis | Events consume, notifications push | `notifications.dispatch` |
| **API Gateway/BFF** | FastAPI | Aggregation, caching, auth, pagination | — |

### 2.2 Data Stores & Infra

- Har service ka apna Postgres schema + shared master data (`teachers`, `subjects`, `campuses`, `classrooms`, `programs`, `sessions`).
- Redis: pub/sub channels (`notifications:requests`, ...), timetable snapshots, dashboard aggregates.
- Kafka: domain topics + DLQ, schema registry `infra/events/` me.
- Celery: heavy jobs (grade import, timetable recompute, notification retries).
- Observability: OpenTelemetry traces, Prometheus metrics, Loki/ELK logs.
- Deployment: per-service Dockerfile + Helm chart, CI/CD pipeline lint → test → build → push → helm upgrade.

### 2.3 Layered Pattern

```text
controllers/  -> REST + GraphQL endpoints
services/     -> business logic
repositories/ -> ORM + caching
models/       -> DB + Pydantic
events/       -> publish/consume schemas
```

## 3. Notification Blueprint

### 3.1 Core Requirements

- Har action par notification: create, update, comment, reassign, approval, publish/unpublish, timetable tweaks, waghera.
- Audience scoping: jis jis par asar ho (originator, assigned coordinator, relevant teachers/students) un sab ko alert mile.
- Delivery: in-app toast, inbox list, badge count, future me email/SMS.
- Progress visualization: event history se timeline component (same data as notifications).

### 3.2 Event Flow

1. Controller service ko call karta.
2. Service Kafka topic par event emit karti (actor, entity, action, payload diff).
3. Notification service event consume kar ke template apply karti, DB me row store karti, Redis pub/sub par publish karti.
4. WebSocket gateway connected clients ko push karta.
5. Clients toast + list update karte (TanStack Query cache invalidation).

### 3.3 Templates

| Domain | Action | Message Example | Priority |
| --- | --- | --- | --- |
| Request | Status change | “Request #REQ-239 _In Progress_ me gaya by Sana.” | Medium |
| Request | Comment | “Ahmed ne Request #REQ-239 par comment drop kiya.” | Low |
| Transfer | Approval | “Transfer #TR-101 Registrar ne approve kiya. Effective 05 Dec.” | High |
| Result | Publish | “Physics 101 midterm result publish ho gaya.” | High |
| Timetable | Slot change | “Class 8-B Math Room 204 me 10:00 par shift hua.” | Medium |

### 3.4 UX Integration

- `notification-bell` component me domain filters + progress timeline link.
- Admin dashboards me “Activity Stream” widget (`/notifications/feed` se data).
- Per-page toast WebSocket se aate, extra API hits nahi.

## 4. API Optimization Strategy

### 4.1 Current Pain

- Coordinator pages bar bar multiple REST calls kar rahi (attendance, requests, stats).
- Aggregation/caching nahi; har navigation par repeated calls.

### 4.2 Target Architecture

1. **API Gateway/BFF**: server-side aggregation, Redis caching (TTL + event-based bust), UI-specific endpoints (`/dashboard/coordinator`).
2. **Event-Driven Projections**: Kafka consumers read-optimized tables banate (request counts, timetable snapshot, result summary).
3. **Client Optimization**: WebSockets for live data, HTTP/2 keep-alive, TanStack Query batching, ETags/If-None-Match for static data.
4. **Background Jobs**: bulk imports/timetable regen Celery pe; client `jobs/{id}` poll karta ya WebSocket se update leta.
5. **Monitoring**: per-route latency dashboards, rate limits, error budgets gateway pe.

### 4.3 Checklist

- [ ] `gateway/` service introduce karo (caching middleware ke sath).
- [ ] Frontend Aggregated endpoints consume kare.
- [ ] Redis cache keys convention: `cache:dashboard:{role}:{filters}`.
- [ ] OpenAPI me caching policy mention.
- [ ] Aggregated endpoints pe k6/Locust load tests.

## 5. Domain Specifications

### 5.1 Request Management

**Use Cases**: teacher/staff request create, auto-triage, status update/comment/attachment, escalation, SLA tracking.

**Data**: `Request`, `RequestHistory`, `Attachment`.

**APIs**: `POST /requests`, `GET /requests/dashboard`, `PATCH /requests/{id}`, `POST /requests/{id}/comments`, `GET /requests/{id}/timeline`.

**Notifications**: creation, assignment, status change, comment, SLA breach.

### 5.2 Student Transfer

**Use Cases**: transfer initiate, multi approval steps, auto validations (capacity, fees, attendance), final apply + enrollment sync.

**Data**: `TransferRequest`, `ApprovalStep`, `TransferAudit`.

**APIs**: `POST /transfers`, `GET /transfers/pending`, `POST /transfers/{id}/approve`, `POST /transfers/{id}/apply`.

**Notifications**: student + coordinator + teachers update chain ke mutabiq alerts.

### 5.3 Result Management

**Use Cases**: assessments create, grade entry/bulk import, moderation, publish/unpublish, reopen.

**Data**: `Assessment`, `ResultEntry`, `ResultVersion`.

**APIs**: `POST /results/assessments`, `POST /results/entries/bulk`, `PATCH /results/entries/{id}`, `POST /results/publish`, `GET /results/summary`.

**Notifications**: moderation actions, student publish alerts, admin anomalies.

### 5.4 Timetable Service

**Use Cases**: templates CRUD, teacher/room assignment, conflict detection, overrides/substitutions.

**Data**: `TimetableTemplate`, `Timeslot`, `Override`.

**APIs**: `POST /timetables/templates`, `POST /timetables/{id}/generate`, `GET /timetables/teacher/{teacherId}`, `POST /timetables/{id}/override`.

**Notifications**: teacher/student slot changes, attendance sync triggers.

## 6. Data Requirements

- Master data clean-up (teachers, students, classes, campuses, classrooms capacity, subjects, sessions, holidays).
- Access control matrix update (role vs permission).
- Notification templates + translation keys central repo.
- SLA rules, transfer constraints, grading scales, timetable policies finalize karo.

## 7. Deployment & DevOps

- **Dockerfiles**: multi-stage, same env variables across dev/stage/prod, secrets via K8s.
- **Helm**: resources, autoscaling, Kafka/Redis configs.
- **CI/CD**: lint/test for har service, gateway contract tests, container security scans.
- **Observability**: dashboards (latency, throughput, errors), notification metrics (sent/failed/retry).

## 8. Testing & Rollout Plan

1. Unit + integration tests (coverage ≥85%).
2. Pact contract tests (gateway ↔ services).
3. Load tests (k6/Locust) aggregated endpoints + notification throughput.
4. WebSocket regression suite (har event UI tak pohanchay).
5. UAT scripts per domain (coordinator, teacher, registrar sign-off).
6. Rollout: staged/shadow deployments, feature flags, training + quickstart guides for adoption (Phase 1 learnings).

## 9. Next Steps & Responsibilities

| Step | Owner | Due | Notes |
| --- | --- | --- | --- |
| Business rules + master data gaps confirm | Product + SMEs | 18 Nov | Schema freeze se pehle |
| API + event specs finalize (OpenAPI + AsyncAPI) | Backend | 22 Nov | `docs/apis/` me store |
| Wireframes tayar | UX | 24 Nov | Admin, teacher, student flows |
| Notification Service + Gateway implement | Platform team | Sprint 1 | Pura Phase 2 is par depend |
| Domain services deliver (Requests → Transfers → Results → Timetable) | Feature squads | Sprint 2+ | Priority order follow karo |
| QA + UAT | QA + Stakeholders | Har sprint ke baad | Performance + WebSocket tests |
| Production rollout + adoption tracking | Ops + Training | Post-UAT | Walkthroughs, feedback loop |

---

_Ye Roman Urdu document development, QA aur rollout teams ko Phase 2 me guide karega. Kisi bhi change par isi file ko update karo taake sab aligned rahen._

