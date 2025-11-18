# Service Communication Patterns

## 🎯 Communication Types

### 1. Synchronous (HTTP/REST)
- **When**: Immediate response needed
- **Use**: Service-to-service calls, Frontend-to-service
- **Technology**: REST APIs via API Gateway

### 2. Asynchronous (Event-Driven)
- **When**: Non-critical, eventual consistency OK
- **Use**: Cross-service notifications, data sync
- **Technology**: Apache Kafka

### 3. Real-time (WebSocket)
- **When**: Live updates needed
- **Use**: Real-time notifications, live dashboards
- **Technology**: Redis Pub/Sub + Django Channels

---

## 🔄 Synchronous Communication (HTTP/REST)

### Pattern: API Gateway Routing

```
Frontend → API Gateway → Service
```

**Example**: Get Student Data

```python
# Frontend
const response = await fetch('https://api.domain.com/api/students/123', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

# API Gateway routes to Student Service
# Student Service returns data
```

### Service-to-Service Calls

**When to Use**:
- Need immediate response
- Transaction requires multiple services
- Data not available via events

**Example**: Get Student with Attendance

```python
# In Student Service
def get_student_with_attendance(student_id):
    # Get student
    student = Student.objects.get(id=student_id)
    
    # Call Attendance Service
    attendance_data = requests.get(
        f'http://attendance-service:8000/api/attendance/student/{student_id}',
        headers={'Authorization': f'Bearer {service_token}'}
    ).json()
    
    return {
        'student': student_data,
        'attendance': attendance_data
    }
```

**Best Practices**:
- Use service discovery (Kubernetes DNS)
- Implement circuit breakers
- Set timeout limits
- Use connection pooling
- Cache responses when possible

### Circuit Breaker Pattern

```python
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=60)
def call_attendance_service(student_id):
    try:
        response = requests.get(
            f'http://attendance-service:8000/api/attendance/student/{student_id}',
            timeout=5
        )
        return response.json()
    except Exception as e:
        # Circuit opens after 5 failures
        # Returns cached data or default
        return get_cached_attendance(student_id)
```

---

## 📨 Asynchronous Communication (Kafka)

### Setup Kafka

#### Docker Compose

```yaml
version: '3.8'

services:
  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:latest
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
```

#### Kubernetes

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
spec:
  serviceName: kafka
  replicas: 3
  template:
    spec:
      containers:
      - name: kafka
        image: confluentinc/cp-kafka:latest
        env:
        - name: KAFKA_BROKER_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: KAFKA_ZOOKEEPER_CONNECT
          value: zookeeper:2181
```

### Kafka Topics

#### Create Topics

```bash
# Create topic
kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic user.created \
  --partitions 3 \
  --replication-factor 2

# List topics
kafka-topics --list --bootstrap-server localhost:9092
```

#### Topic List

```
user.created
user.updated
user.deleted
student.created
student.updated
student.enrolled
student.transferred
teacher.created
teacher.updated
attendance.marked
attendance.alert
classroom.created
classroom.updated
campus.created
campus.updated
request.created
request.approved
request.rejected
notification.send
```

### Producer (Publish Events)

```python
# student-service/producers.py
from kafka import KafkaProducer
import json

producer = KafkaProducer(
    bootstrap_servers=['kafka:9092'],
    value_serializer=lambda v: json.dumps(v).encode('utf-8')
)

def publish_student_created(student):
    event = {
        'event_type': 'student.created',
        'student_id': str(student.id),
        'user_id': str(student.user_id),
        'campus_id': str(student.campus_id),
        'classroom_id': str(student.classroom_id),
        'timestamp': student.created_at.isoformat()
    }
    
    producer.send('student.created', value=event)
    producer.flush()
```

### Consumer (Subscribe to Events)

```python
# attendance-service/consumers.py
from kafka import KafkaConsumer
import json

consumer = KafkaConsumer(
    'student.created',
    bootstrap_servers=['kafka:9092'],
    value_deserializer=lambda m: json.loads(m.decode('utf-8')),
    group_id='attendance-service-group'
)

def consume_student_events():
    for message in consumer:
        event = message.value
        
        if event['event_type'] == 'student.created':
            # Create attendance record
            AttendanceRecord.objects.create(
                student_id=event['student_id'],
                # ... other fields
            )
```

### Django Integration

```python
# Install: pip install kafka-python

# settings.py
KAFKA_BOOTSTRAP_SERVERS = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092')

# Create management command
# management/commands/consume_events.py
from django.core.management.base import BaseCommand
from kafka import KafkaConsumer
import json

class Command(BaseCommand):
    def handle(self, *args, **options):
        consumer = KafkaConsumer(
            'student.created',
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            group_id='attendance-service-group'
        )
        
        for message in consumer:
            event = message.value
            # Process event
            self.process_event(event)
    
    def process_event(self, event):
        if event['event_type'] == 'student.created':
            # Handle student created
            pass
```

### Event Schema

```python
# Standard event format
{
    "event_type": "student.created",
    "event_id": "uuid",
    "timestamp": "2025-01-15T10:30:00Z",
    "source": "student-service",
    "data": {
        "student_id": "uuid",
        "user_id": "uuid",
        "campus_id": "uuid",
        # ... other fields
    }
}
```

---

## 🔴 Real-time Communication (WebSocket)

### Redis Pub/Sub Setup

```python
# notification-service/consumers.py
import redis
import json

redis_client = redis.Redis(host='redis', port=6379, db=0)
pubsub = redis_client.pubsub()

def subscribe_to_events():
    pubsub.subscribe('notification.send')
    
    for message in pubsub.listen():
        if message['type'] == 'message':
            event = json.loads(message['data'])
            handle_notification(event)

def handle_notification(event):
    # Send via WebSocket
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"user_{event['user_id']}",
        {
            "type": "notification_message",
            "message": event
        }
    )
```

### Publishing Events

```python
# In any service
import redis
import json

redis_client = redis.Redis(host='redis', port=6379, db=0)

def send_realtime_notification(user_id, message):
    event = {
        'user_id': str(user_id),
        'message': message,
        'timestamp': datetime.now().isoformat()
    }
    
    redis_client.publish('notification.send', json.dumps(event))
```

### Django Channels WebSocket

```python
# notification-service/consumers.py
from channels.generic.websocket import AsyncWebsocketConsumer
import json

class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user_id = self.scope['user'].id
        self.room_group_name = f'user_{self.user_id}'
        
        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
    
    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
    
    async def notification_message(self, event):
        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            'message': event['message']
        }))
```

---

## 🔄 Communication Patterns

### 1. Request-Response (Synchronous)

```
Service A → HTTP Request → Service B
Service A ← HTTP Response ← Service B
```

**Use Case**: Get student data with attendance

### 2. Fire-and-Forget (Asynchronous)

```
Service A → Publish Event → Kafka
Service B ← Consume Event ← Kafka
```

**Use Case**: Student enrolled → Send welcome email

### 3. Publish-Subscribe (Asynchronous)

```
Service A → Publish Event → Kafka Topic
Service B ← Subscribe ← Kafka Topic
Service C ← Subscribe ← Kafka Topic
Service D ← Subscribe ← Kafka Topic
```

**Use Case**: Student created → Multiple services react

### 4. Request-Reply (Asynchronous)

```
Service A → Publish Request → Kafka Topic
Service B ← Consume Request ← Kafka Topic
Service B → Publish Reply → Kafka Topic
Service A ← Consume Reply ← Kafka Topic
```

**Use Case**: Complex distributed transaction

---

## 🛡️ Error Handling

### Retry Mechanism

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
def call_service(url):
    response = requests.get(url, timeout=5)
    response.raise_for_status()
    return response.json()
```

### Dead Letter Queue

```python
# If event processing fails after retries, send to DLQ
def process_event(event):
    try:
        # Process event
        handle_event(event)
    except Exception as e:
        # Send to dead letter queue
        producer.send('events.dlq', value={
            'original_event': event,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        })
```

### Circuit Breaker

```python
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=60)
def call_external_service():
    return requests.get('http://external-service/api')
```

---

## 📊 Monitoring

### Kafka Metrics

```python
# Monitor topic lag
from kafka import KafkaConsumer

consumer = KafkaConsumer('student.created', bootstrap_servers=['kafka:9092'])
partition_lag = consumer.end_offsets(consumer.assignment())
```

### HTTP Metrics

```python
# Track service calls
import time
from prometheus_client import Counter, Histogram

http_requests_total = Counter('http_requests_total', 'Total HTTP requests', ['service', 'method'])
http_request_duration = Histogram('http_request_duration_seconds', 'HTTP request duration', ['service'])

def call_service(service_name, url):
    start_time = time.time()
    try:
        response = requests.get(url)
        http_requests_total.labels(service=service_name, method='GET').inc()
        return response
    finally:
        duration = time.time() - start_time
        http_request_duration.labels(service=service_name).observe(duration)
```

---

## ✅ Best Practices

1. **Use Events for Non-Critical Operations**: Don't block on notifications
2. **Use HTTP for Critical Operations**: Need immediate response
3. **Idempotency**: Make operations idempotent (can be retried safely)
4. **Version Events**: Version your events for backward compatibility
5. **Monitor Everything**: Track all service communications
6. **Timeout Settings**: Set appropriate timeouts for HTTP calls
7. **Connection Pooling**: Reuse connections for HTTP calls
8. **Error Handling**: Always handle failures gracefully

