# Step-by-Step Migration Guide

## 🎯 Migration Strategy: Strangler Fig Pattern

We'll use the **Strangler Fig Pattern** - gradually replace the monolithic application with microservices while keeping the old system running.

## 📅 Migration Timeline (16 Weeks)

---

## Phase 1: Infrastructure Setup (Week 1-2)

### Week 1: Setup Development Environment

#### Day 1-2: Setup Kubernetes Cluster
```bash
# Install minikube or use cloud K8s
minikube start
kubectl cluster-info

# Create namespaces
kubectl create namespace microservices
kubectl create namespace api-gateway
```

#### Day 3-4: Setup API Gateway (Kong)
```yaml
# Deploy Kong API Gateway
# Create kong-config.yaml
# Setup routing rules
```

**Tasks**:
- [ ] Install Kong API Gateway
- [ ] Configure basic routing
- [ ] Setup health checks
- [ ] Test with existing monolithic app

#### Day 5: Setup Kafka
```bash
# Deploy Kafka cluster
kubectl apply -f kafka-deployment.yaml
```

**Tasks**:
- [ ] Deploy Kafka (3 brokers)
- [ ] Create initial topics
- [ ] Setup Kafka UI for monitoring
- [ ] Test producer/consumer

#### Day 6-7: Setup Monitoring
**Tasks**:
- [ ] Deploy Prometheus
- [ ] Deploy Grafana
- [ ] Setup ELK stack
- [ ] Configure dashboards

---

### Week 2: Service Templates & CI/CD

#### Day 1-2: Create Service Template
```python
# Create base service template with:
# - Django project structure
# - Dockerfile
# - Kubernetes manifests
# - Health check endpoints
# - Kafka consumer/producer setup
```

**Tasks**:
- [ ] Create `service-template/` directory
- [ ] Setup Django project template
- [ ] Create Dockerfile
- [ ] Create Kubernetes deployment YAML
- [ ] Create service YAML
- [ ] Add health check endpoint

#### Day 3-4: Setup CI/CD Pipeline
```yaml
# .github/workflows/deploy-service.yml
# - Build Docker image
# - Push to registry
# - Deploy to Kubernetes
# - Run tests
```

**Tasks**:
- [ ] Setup GitHub Actions
- [ ] Create Docker registry
- [ ] Setup automated testing
- [ ] Create deployment scripts

#### Day 5-7: Database Migration Strategy
**Tasks**:
- [ ] Create database migration scripts
- [ ] Setup database per service
- [ ] Create data replication strategy
- [ ] Test data migration

---

## Phase 2: Extract Auth Service (Week 3-4)

### Week 3: Create Auth Service

#### Day 1-2: Extract Auth Logic
```python
# Create auth-service/
# - Copy users app
# - Keep only auth-related models
# - Extract login/logout/token logic
```

**Tasks**:
- [ ] Create `auth-service/` directory
- [ ] Copy and refactor authentication code
- [ ] Create minimal User model (id, username, email, password, role)
- [ ] Setup JWT token generation
- [ ] Create token validation endpoint

#### Day 3-4: Setup Auth Service Database
```sql
-- Create auth_db
-- Migrate only auth-related tables
-- Setup replication from main DB
```

**Tasks**:
- [ ] Create `auth_db` database
- [ ] Run migrations
- [ ] Setup database replication (read from main DB)
- [ ] Test data sync

#### Day 5: Deploy Auth Service
**Tasks**:
- [ ] Build Docker image
- [ ] Deploy to Kubernetes
- [ ] Configure API Gateway routing
- [ ] Test endpoints

#### Day 6-7: Integration Testing
**Tasks**:
- [ ] Test login flow
- [ ] Test token validation
- [ ] Test with existing frontend
- [ ] Fix any issues

### Week 4: Dual-Write Strategy

#### Day 1-3: Implement Dual-Write
```python
# In monolithic app:
# - Keep existing auth endpoints
# - Also write to Auth Service
# - Gradually shift traffic
```

**Tasks**:
- [ ] Modify monolithic app to write to both DBs
- [ ] Setup API Gateway to route `/api/auth/*` to Auth Service
- [ ] Keep old endpoints as fallback
- [ ] Monitor both systems

#### Day 4-5: Traffic Migration
**Tasks**:
- [ ] Route 10% traffic to Auth Service
- [ ] Monitor for errors
- [ ] Gradually increase to 50%, then 100%
- [ ] Keep old endpoints as backup

#### Day 6-7: Cleanup
**Tasks**:
- [ ] Remove auth code from monolithic app (keep as backup)
- [ ] Update frontend to use new endpoints
- [ ] Document Auth Service API

---

## Phase 3: Extract Core Services (Week 5-8)

### Week 5: User Management Service

#### Day 1-2: Extract User Service
```python
# Create user-service/
# - User CRUD operations
# - User profiles
# - User permissions
```

**Tasks**:
- [ ] Create `user-service/` directory
- [ ] Extract user management logic
- [ ] Setup `user_db` database
- [ ] Create Kafka producer for user events

#### Day 3-4: Deploy & Test
**Tasks**:
- [ ] Deploy User Service
- [ ] Setup API Gateway routing
- [ ] Test CRUD operations
- [ ] Test event publishing

#### Day 5-7: Integration
**Tasks**:
- [ ] Update Auth Service to consume `user.created` events
- [ ] Test end-to-end flow
- [ ] Migrate traffic gradually

### Week 6: Student Service

#### Day 1-3: Extract Student Service
**Tasks**:
- [ ] Create `student-service/` directory
- [ ] Extract student management logic
- [ ] Setup `student_db` database
- [ ] Create Kafka topics for student events

#### Day 4-5: Deploy & Test
**Tasks**:
- [ ] Deploy Student Service
- [ ] Test all endpoints
- [ ] Test event publishing/consuming

#### Day 6-7: Integration
**Tasks**:
- [ ] Update Notification Service to listen to student events
- [ ] Update Attendance Service to consume student data
- [ ] Migrate traffic

### Week 7: Teacher Service

**Similar process as Student Service**

### Week 8: Academic Service

**Similar process - Extract campus, classes, grades management**

---

## Phase 4: Extract Supporting Services (Week 9-12)

### Week 9: Attendance Service

#### Day 1-3: Extract Attendance Service
**Tasks**:
- [ ] Create `attendance-service/`
- [ ] Extract attendance logic
- [ ] Setup `attendance_db`
- [ ] Create Kafka consumers for student/classroom events

#### Day 4-7: Deploy & Integrate
**Tasks**:
- [ ] Deploy service
- [ ] Test with Student Service
- [ ] Test with Academic Service
- [ ] Migrate traffic

### Week 10: Notification Service

#### Day 1-3: Extract Notification Service
**Tasks**:
- [ ] Create `notification-service/`
- [ ] Extract notification logic
- [ ] Setup WebSocket (Django Channels)
- [ ] Setup Redis pub/sub
- [ ] Create Kafka consumers for all events

#### Day 4-7: Deploy & Test
**Tasks**:
- [ ] Deploy service
- [ ] Test WebSocket connections
- [ ] Test event consumption
- [ ] Test email notifications

### Week 11: Request Service

**Similar extraction process**

### Week 12: Result Service

**Similar extraction process**

---

## Phase 5: Extract Remaining Services (Week 13-14)

### Week 13: Transfer, Behaviour Services

**Extract and deploy both services**

### Week 14: Coordinator, Principal Services

**Extract and deploy both services**

---

## Phase 6: Optimization & Cleanup (Week 15-16)

### Week 15: Performance Optimization

#### Tasks:
- [ ] Optimize database queries
- [ ] Add caching layers
- [ ] Optimize Kafka message processing
- [ ] Load testing
- [ ] Performance tuning

### Week 16: Final Cleanup

#### Tasks:
- [ ] Remove old monolithic code (keep as backup)
- [ ] Update all documentation
- [ ] Create runbooks
- [ ] Final testing
- [ ] Production deployment

---

## 🔄 Migration Techniques

### 1. Database Migration

#### Step 1: Setup Replication
```sql
-- In PostgreSQL, setup logical replication
-- Replicate data from main DB to service DBs
```

#### Step 2: Dual-Write Period
```python
# Write to both databases
def create_student(data):
    # Write to main DB (existing)
    student = Student.objects.create(**data)
    
    # Also write to Student Service DB
    student_service_client.create_student(data)
    
    return student
```

#### Step 3: Cutover
```python
# Stop writing to main DB
# Only write to service DB
# Read from service DB
```

### 2. API Gateway Routing

#### Gradual Traffic Shift
```yaml
# Kong configuration
# Week 1: 10% traffic to new service
# Week 2: 50% traffic
# Week 3: 100% traffic
```

### 3. Event Migration

#### Step 1: Publish Events from Monolith
```python
# In monolithic app, publish events
kafka_producer.send('user.created', user_data)
```

#### Step 2: Services Consume Events
```python
# In microservices, consume events
kafka_consumer.subscribe('user.created')
```

#### Step 3: Remove Event Publishing from Monolith
```python
# After all services migrated, remove event code
```

---

## 🧪 Testing Strategy

### Unit Tests
- Each service has comprehensive unit tests
- Test coverage > 80%

### Integration Tests
- Test service-to-service communication
- Test event flow
- Test API Gateway routing

### End-to-End Tests
- Test complete user flows
- Test with frontend
- Load testing

### Canary Deployments
- Deploy new version to 10% of pods
- Monitor metrics
- Gradually increase if healthy

---

## 🚨 Rollback Plan

### If Service Fails
1. Route traffic back to monolithic app
2. Investigate issue
3. Fix and redeploy
4. Retry migration

### Database Rollback
1. Stop replication
2. Use backup to restore
3. Continue with monolithic DB

---

## ✅ Success Checklist

### For Each Service:
- [ ] Service deployed and running
- [ ] Health checks passing
- [ ] API Gateway routing configured
- [ ] Database migrated
- [ ] Events publishing/consuming
- [ ] Integration tests passing
- [ ] Traffic migrated (100%)
- [ ] Monitoring configured
- [ ] Documentation updated

### Overall:
- [ ] All services running
- [ ] Zero downtime achieved
- [ ] Performance acceptable
- [ ] All tests passing
- [ ] Documentation complete

