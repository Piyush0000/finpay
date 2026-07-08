<div align="center">

# 💸 FinPay

### A production-grade distributed payment & wallet infrastructure

[![Node.js](https://img.shields.io/badge/Node.js-20-brightgreen?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-black?logo=express)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-green?logo=mongodb)](https://mongodb.com)
[![Redis](https://img.shields.io/badge/Redis-7.2-red?logo=redis)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)](https://docker.com)
[![License](https://img.shields.io/badge/license-ISC-blue)](LICENSE)

> FinPay is a microservices-based backend payment system built to simulate how real-world fintech platforms (like Razorpay, Stripe, or PhonePe) process transactions reliably at scale — with distributed locking, idempotent APIs, async queues, and saga-based rollbacks.

</div>

---

## 📋 Table of Contents

- [What FinPay Does](#-what-finpay-does)
- [Architecture](#-architecture)
- [Services](#-services)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [Payment Flow](#-payment-flow)
- [Key Engineering Concepts](#-key-engineering-concepts)
- [Environment Variables](#-environment-variables)
- [Running Tests](#-running-tests)
- [Future Improvements](#-future-improvements)

---

## ✅ What FinPay Does

- 🔐 **User auth** — Register, login, logout with RS256 JWT + refresh token rotation
- 👛 **Wallets** — Create wallets, check balances, credit/debit with distributed locks
- 💸 **Transfers** — Peer-to-peer money transfers with idempotency protection
- ⚙️ **Async processing** — BullMQ queue-based payment worker with retries
- 🔔 **Notifications** — Email alerts on successful/failed payments
- 📊 **Analytics** — Real-time transaction metrics via Redis Streams
- 🛡️ **Double-spend protection** — Redis `SETNX` locks on every wallet operation
- ↩️ **Saga rollbacks** — Automatic reversal if any transfer step fails

---

## 🏗 Architecture

```
                        ┌─────────────────┐
                        │   Client / App  │
                        └────────┬────────┘
                                 │ HTTP
                        ┌────────▼────────┐
                        │   API Gateway   │  :3000
                        │  JWT Verify +   │
                        │  Rate Limiting  │
                        └──┬──────┬───┬───┘
                           │      │   │
              ┌────────────▼┐  ┌──▼───▼──────┐  ┌─────────────────┐
              │ Auth Service│  │Wallet Service│  │Transaction Svc  │
              │    :3001    │  │    :3002     │  │    :3003        │
              └──────┬──────┘  └──────┬───────┘  └───────┬─────────┘
                     │                │                   │
              ┌──────▼────────────────▼───────────────────▼─────────┐
              │                    MongoDB                           │
              │         users | wallets | transactions               │
              └──────────────────────────────────────────────────────┘
                     │                │                   │
              ┌──────▼────────────────▼───────────────────▼─────────┐
              │                     Redis                            │
              │         tokens | locks | queues | streams            │
              └──────────────────────────────────────────────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │       Payment Worker         │
                        │   BullMQ consumer + retries  │
                        └──────┬───────────────────────┘
                               │
                ┌──────────────▼─────────────┐
                │    Notification Service     │
                │    Email alerts on events   │
                └─────────────────────────────┘
```

---

## 🧩 Services

### 1. 🚦 API Gateway (`port 3000`)
The single entry point for all client traffic.

| Responsibility | How |
|---|---|
| JWT verification | Reads `Authorization` header, verifies RS256 signature |
| Request routing | Proxies to correct downstream service |
| Header injection | Adds `x-user-id` + `x-user-email` to every authenticated request |
| Health checks | `GET /health` returns system status |

**Why RSA (RS256) instead of HMAC (HS256)?**
> Auth-service signs with the **private key** (only it has). Gateway verifies with the **public key** (read-only). Even if the gateway is compromised, attackers cannot forge tokens — they don't have the private key.

---

### 2. 🔐 Auth Service (`port 3001`)
Handles all identity and session management.

| Endpoint | What it does |
|---|---|
| `POST /auth/register` | Create account, hash password with bcryptjs (12 rounds) |
| `POST /auth/login` | Verify credentials, issue access + refresh tokens |
| `GET /auth/me` | Return current user profile |
| `POST /auth/refresh` | Rotate refresh token (old token immediately invalidated) |
| `POST /auth/logout` | Blacklist refresh token |

**Token Strategy:**
- `accessToken` — RS256 JWT, expires in **15 minutes**, stateless
- `refreshToken` — 64-char hex, stored in MongoDB, **rotated on every use** (replay attack protection)

---

### 3. 👛 Wallet Service (`port 3002`)
Maintains balances and ledger entries.

| Endpoint | What it does |
|---|---|
| `POST /wallets` | Create a wallet (one per user, INR, starts at 0) |
| `GET /wallets/me` | Get your wallet balance |
| `POST /wallets/internal/debit` | Internal: deduct balance (called by transaction-service) |
| `POST /wallets/internal/credit` | Internal: add balance (called by transaction-service) |

**Double-Spend Protection:**
> Every debit/credit acquires a Redis distributed lock (`SETNX`) on the wallet ID. Concurrent transfers to/from the same wallet are serialized — preventing balance corruption.

---

### 4. 💸 Transaction Service (`port 3003`)
Orchestrates peer-to-peer transfers.

| Endpoint | What it does |
|---|---|
| `POST /transfers` | Initiate a transfer (validates balance, creates job) |
| `GET /transfers/:id` | Get transaction status |
| `GET /transfers` | Paginated transaction history |

**Idempotency:** Every transfer requires an `Idempotency-Key` header. Duplicate requests with the same key return the original response — no double charges.

**Saga Pattern:**
```
1. Create Transaction (PENDING)
2. Debit sender wallet
   ↳ If fails → mark FAILED (no rollback needed, nothing credited)
3. Credit receiver wallet
   ↳ If fails → rollback: re-credit sender → mark FAILED
4. Mark Transaction COMPLETED
```

---

### 5. ⚙️ Payment Worker
BullMQ background worker that processes payment jobs from the queue.

- Exponential backoff retries (3 attempts)
- Dead-letter queue for permanently failed jobs
- Publishes completion events to Redis Streams

---

### 6. 🔔 Notification Service (`port 3004`)
Sends email notifications on payment events.

- Subscribes to Redis Streams for `payment.completed` / `payment.failed` events
- Queues email jobs via BullMQ
- Powered by [Resend](https://resend.com) API

---

### 7. 📊 Analytics Service (`port 3005`)
Real-time transaction metrics and dashboards.

- Consumes events from Redis Streams (`XADD/XREAD`)
- Aggregates daily volumes, success rates, user spending
- Exposes dashboard APIs

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20 (LTS) |
| **Framework** | Express.js 5 |
| **Database** | MongoDB 7.0 + Mongoose |
| **Cache / Locks** | Redis 7.2 |
| **Queue** | BullMQ + Redis |
| **Auth** | JWT (RS256) + bcryptjs |
| **Logging** | Pino (structured JSON) |
| **Infra** | Docker + Docker Compose |
| **Monorepo** | npm workspaces |

---

## 📁 Project Structure

```
finpay/
├── packages/
│   ├── api-gateway/          # Single entry point, JWT guard, proxy
│   ├── auth-service/         # Register, login, token management
│   ├── wallet-service/       # Wallets, balances, debit/credit
│   ├── transaction-service/  # Transfers, saga orchestration
│   ├── payment-worker/       # BullMQ consumer, async processing
│   ├── notification-service/ # Email notifications on events
│   ├── analytics-service/    # Real-time metrics & dashboards
│   └── shared/               # Logger, error classes, middleware
├── scripts/
│   └── test-phase1.js        # End-to-end test suite (37 checks)
├── docker-compose.yml
├── package.json              # npm workspaces root
└── .env.example              # Required environment variables
```

---

## 🚀 Getting Started

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with WSL2 + virtualization enabled)
- [Node.js 20+](https://nodejs.org)

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/finpay.git
cd finpay
```

### 2. Set up environment
```bash
cp .env.example .env
```

Generate RSA key pair and fill in `.env`:
```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Generate public key
openssl rsa -in private.pem -pubout -out public.pem
```

Copy the contents of `private.pem` → `JWT_PRIVATE_KEY` and `public.pem` → `JWT_PUBLIC_KEY` in `.env`.

### 3. Start all services
```bash
docker compose up --build -d
```

This starts 6 containers in the correct dependency order:
```
mongo → redis → auth → wallet → transaction → api-gateway
```

### 4. Verify everything is running
```bash
docker compose ps
```

```
finpay-mongo       Healthy
finpay-redis       Running
finpay-auth        Healthy
finpay-wallet      Healthy
finpay-transaction Healthy
finpay-gateway     Running
```

### 5. Test the API
```bash
curl http://localhost:3000/health
```

---

## 📡 API Reference

All requests go through `http://localhost:3000`.

### Auth

```bash
# Register
POST /api/auth/register
{ "name": "John Doe", "email": "john@example.com", "password": "secret123" }

# Login
POST /api/auth/login
{ "email": "john@example.com", "password": "secret123" }
# Returns: { accessToken, refreshToken, user }

# Get profile (requires Authorization header)
GET /api/auth/me
Authorization: Bearer <accessToken>

# Refresh token
POST /api/auth/refresh
{ "refreshToken": "<refreshToken>" }

# Logout
POST /api/auth/logout
{ "refreshToken": "<refreshToken>" }
```

### Wallets

```bash
# Create wallet
POST /api/wallets
Authorization: Bearer <accessToken>

# Get my wallet
GET /api/wallets/me
Authorization: Bearer <accessToken>
```

### Transfers

```bash
# Send money
POST /api/transfers
Authorization: Bearer <accessToken>
Idempotency-Key: <unique-key>
{ "receiverEmail": "jane@example.com", "amount": 50000, "currency": "INR" }
# amount is in paisa (50000 = ₹500)

# Get transfer status
GET /api/transfers/:transactionId
Authorization: Bearer <accessToken>

# Transaction history (paginated)
GET /api/transfers?page=1&limit=10
Authorization: Bearer <accessToken>
```

---

## 💰 Payment Flow

```
POST /api/transfers
        │
        ▼
API Gateway — JWT verify → inject x-user-id
        │
        ▼
Transaction Service
   ├── Validate: does sender have enough balance? (pre-check)
   ├── Create Transaction record → status: PENDING
   ├── Push job to BullMQ queue
        │
        ▼
Payment Worker (async)
   ├── Acquire Redis lock on sender wallet
   ├── Debit sender
   ├── Release lock
   ├── Acquire Redis lock on receiver wallet
   ├── Credit receiver
   ├── Release lock
   ├── Update Transaction → status: COMPLETED
   └── Publish event to Redis Streams
        │
        ▼
Notification Service
   └── Send email to sender + receiver
```

---

## 🧠 Key Engineering Concepts

| Concept | Where it's used |
|---|---|
| **Distributed Locking** | Redis `SETNX` on wallet ops to prevent concurrent balance corruption |
| **Idempotency** | `Idempotency-Key` header — same request, same response, no double-charge |
| **Saga Pattern** | If credit fails after debit → automatically re-credits sender |
| **Token Rotation** | Refresh tokens are single-use; replay attacks return 401 |
| **Event-Driven** | Redis Streams decouple payment processing from notifications/analytics |
| **Async Queues** | BullMQ with exponential backoff handles transient payment failures |
| **Structured Logging** | Pino JSON logs with requestId tracing across all services |
| **Health Checks** | Every service exposes `/health` for Docker orchestration |

---

## 🔧 Environment Variables

See [`.env.example`](.env.example) for full list. Key variables:

| Variable | Description |
|---|---|
| `JWT_PRIVATE_KEY` | RSA private key for signing tokens (auth-service only) |
| `JWT_PUBLIC_KEY` | RSA public key for verifying tokens (api-gateway) |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime (default: `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime (default: `7d`) |
| `MONGO_URI` | MongoDB connection string |
| `REDIS_URL` | Redis connection string |
| `PORT` | Per-service port override |

---

## 🧪 Running Tests

Phase 1 end-to-end test suite (37 assertions):

```bash
# Make sure all services are running first
docker compose up -d

# Run tests
node scripts/test-phase1.js
```

**What gets tested:**
- ✅ User registration + duplicate detection
- ✅ Login + RS256 JWT issuance
- ✅ `/me` endpoint with auth guard
- ✅ Wallet creation + balance check
- ✅ 409 conflict on duplicate wallet
- ✅ Transfer pre-check validation
- ✅ Paginated transaction history
- ✅ Refresh token rotation
- ✅ Old token replay → 401
- ✅ No-auth guard on protected routes

---

## 🔮 Future Improvements

- [ ] Kafka integration for high-throughput event streaming
- [ ] Kubernetes deployment manifests (Helm charts)
- [ ] Circuit breaker pattern (Opossum)
- [ ] Webhook signature verification
- [ ] Multi-currency wallet support
- [ ] Fraud detection rules engine
- [ ] API versioning (`/api/v1/...`)
- [ ] Grafana + Prometheus monitoring
- [ ] End-to-end encryption for sensitive fields

---

## 📌 Local Ports

| Service | Port |
|---|---|
| API Gateway | `3000` |
| Auth Service | `3001` |
| Wallet Service | `3002` |
| Transaction Service | `3003` |
| Notification Service | `3004` |
| Analytics Service | `3005` |
| MongoDB | `27017` |
| Redis | `6379` |

---

## 🎯 Goal

FinPay was built to deeply understand how scalable payment infrastructures work internally — including distributed transaction reliability, concurrent balance management, asynchronous processing pipelines, and fault-tolerant microservice coordination.

---

<div align="center">
  Built with Node.js · MongoDB · Redis · Docker
</div>