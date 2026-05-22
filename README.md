# FinPay

> A distributed payment & wallet infrastructure platform inspired by real fintech systems.

FinPay is a microservices-based backend system where users can create wallets, transfer money, receive notifications, and view transaction analytics — built to simulate how real-world payment systems process transactions reliably at scale.

---

# Architecture Overview

![FinPay Architecture](./architecture.png)

---

# What FinPay Does

- Users can create wallets
- Transfer money to other users
- Prevent duplicate or concurrent double-spend transactions
- Process payments asynchronously using queues
- Retry failed payments automatically
- Send real-time notifications
- Generate analytics from transaction streams

---

# Core System Design

FinPay is designed around distributed systems principles:

- Microservices Architecture
- Event-Driven Communication
- Queue-Based Processing
- Distributed Locking
- Idempotent APIs
- Saga Pattern Rollbacks
- Real-Time Analytics Streams

---

# Services

## 1. API Gateway

Acts as the single entry point for all client requests.

### Responsibilities
- JWT verification
- Rate limiting via Redis
- Request routing
- API proxying

### Tech
- Express
- http-proxy-middleware
- ioredis

---

## 2. Auth Service

Handles user authentication and session management.

### Responsibilities
- Register/Login
- JWT access + refresh tokens
- Refresh token rotation
- Logout blacklisting

### Tech
- Express
- bcrypt
- jsonwebtoken
- MongoDB
- Redis

---

## 3. Wallet Service

Maintains wallet balances and ledger entries.

### Responsibilities
- Create wallets
- Fetch balances
- Credit/Debit operations
- Prevent double spending

### Important Concept
Uses Redis distributed locks (`SETNX`) to avoid concurrent balance corruption.

### Tech
- Express
- MongoDB
- Mongoose
- Redis

---

## 4. Transaction Service

Coordinates peer-to-peer money transfers.

### Responsibilities
- Transfer initiation
- Idempotency protection
- Saga orchestration
- Queue publishing

### Important Concept
Implements Saga rollback flow if any transfer step fails.

### Tech
- Express
- BullMQ
- Redis
- MongoDB

---

## 5. Payment Worker

Background worker process for executing queued payment jobs.

### Responsibilities
- Debit sender
- Credit receiver
- Record transaction
- Retry failed jobs
- Rollback failed transfers

### Features
- Exponential backoff retries
- Dead-letter queues
- Async processing

### Tech
- BullMQ Worker
- Redis
- Axios

---

## 6. Notification Service

Handles asynchronous user notifications.

### Responsibilities
- Subscribe to payment events
- Queue email jobs
- Send notifications
- Store notification history

### Tech
- BullMQ
- Redis Pub/Sub
- MongoDB
- Resend API

---

## 7. Analytics Service

Consumes transaction events and generates real-time metrics.

### Responsibilities
- Daily transaction aggregation
- Success/failure metrics
- User spending analytics
- Dashboard APIs

### Important Concept
Uses Redis Streams (`XADD/XREAD`) for event ingestion.

### Tech
- Express
- Redis Streams
- MongoDB

---

# Payment Flow

```text
Client
  ↓
API Gateway
  ↓
Transaction Service
  ↓
BullMQ Queue
  ↓
Payment Worker
  ↓
Lock Sender Wallet
  ↓
Debit Sender
  ↓
Credit Receiver
  ↓
Store Transaction
  ↓
Publish Event
  ↓
Notification Service
```

---

# Monorepo Structure

```bash
finpay/
├── api-gateway/
├── auth-service/
├── wallet-service/
├── transaction-service/
├── payment-worker/
├── notification-service/
├── analytics-service/
├── shared/
├── docker-compose.yml
└── .env.example
```

---

# Tech Stack

## Backend
- Node.js
- Express.js

## Database
- MongoDB
- Redis

## Queues & Messaging
- BullMQ
- Redis Pub/Sub
- Redis Streams

## Authentication
- JWT
- bcrypt

## Infra
- Docker
- Docker Compose

## Logging & Monitoring
- pino
- Bull Board

---

# Key Engineering Concepts

- Distributed Systems
- Event-Driven Architecture
- Queue Processing
- Distributed Locking
- Idempotency
- Saga Pattern
- Retry Mechanisms
- Exponential Backoff
- Async Workers
- Real-Time Streams

---

# Local Development Ports

| Service | Port |
|---|---|
| API Gateway | 3000 |
| Auth Service | 3001 |
| Wallet Service | 3002 |
| Transaction Service | 3003 |
| Notification Service | 3004 |
| Analytics Service | 3005 |
| Bull Board | 3006 |
| Redis | 6379 |

---

# Future Improvements

- Webhook signature verification
- Kafka integration
- Kubernetes deployment
- Circuit breaker implementation
- API versioning
- Fraud detection rules
- Multi-currency wallet support

---

# Goal of This Project

FinPay was built to deeply understand how scalable payment infrastructures work internally — including transaction reliability, distributed coordination, asynchronous processing, and fault tolerance.

---