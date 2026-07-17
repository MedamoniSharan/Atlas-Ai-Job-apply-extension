# CodeXCareer Job Assistant

# System Design Document (design.md)

**Version:** 1.0

**Status:** Architecture Design

**Stack:** MERN + Chrome Extension (Manifest V3)

---

# 1. System Overview

CodeXCareer Job Assistant is a SaaS platform consisting of:

* React Dashboard
* Chrome Extension
* Node.js Backend
* MongoDB Database
* Redis Cache
* BullMQ Queue
* Socket.IO Real-time Communication

The Chrome extension runs in the user's own authenticated browser session and synchronizes application-related events with the backend. The backend provides dashboards, analytics, resume management, notifications, and account management.

---

# 2. Design Principles

Every component must satisfy the following principles:

* Single Responsibility Principle
* Feature-Based Architecture
* Clean Architecture
* SOLID Principles
* Event-Driven Design
* Scalable Micro-Module Design
* High Observability
* Secure by Default
* Testable
* Maintainable

---

# 3. High-Level Architecture

```text
                     React Dashboard
                           │
                   REST API + Socket.IO
                           │
                Node.js + Express Backend
                           │
     ┌───────────────┬──────────────┬──────────────┐
     │               │              │              │
 MongoDB          Redis         BullMQ         Object Storage
   Atlas          Cache          Queue       (S3/Cloudinary)
                           │
                    Chrome Extension
     ┌───────────────┬───────────────┬──────────────┐
     │               │               │
   Popup      Background SW     Content Script
                           │
                  User Browser Session
                           │
                  Supported Job Platforms
```

---

# 4. Core Components

## Dashboard

Responsibilities

* Authentication
* User Profile
* Resume Management
* Analytics
* Applications
* Notifications
* Subscription
* Settings

---

## Backend

Responsibilities

* Authentication
* REST APIs
* WebSocket Gateway
* Queue Processing
* Resume Storage
* Analytics
* Notification Service
* Audit Logging

---

## Chrome Extension

Responsibilities

* Detect login state
* Observe supported pages
* Read job metadata
* Capture application events
* Maintain offline queue
* Synchronize with backend
* Notify users of errors
* Report health status

---

# 5. Extension Architecture

```text
Extension

├── Popup UI

├── Background Service Worker

├── Content Script

├── Storage Manager

├── Queue Manager

├── Sync Manager

├── Event Bus

├── API Client

├── Health Monitor

├── Error Handler

└── Logger
```

Each module should have a single responsibility and communicate through well-defined interfaces.

---

# 6. Platform Adapter Pattern

Support each job platform through a dedicated adapter.

```text
PlatformAdapter

├── NaukriAdapter

├── LinkedInAdapter

├── FounditAdapter

├── IndeedAdapter

├── WellfoundAdapter

└── InternshalaAdapter
```

Each adapter exposes a common interface:

* Detect supported page
* Read job information
* Detect login state
* Extract company
* Extract role
* Extract location
* Detect application status
* Emit standardized events

This allows adding or updating platform support without affecting the rest of the system.

---

# 7. Event-Driven Synchronization

All user activity is represented as events.

Example event types:

* ExtensionConnected
* LoginDetected
* JobDetected
* ApplicationRecorded
* SyncStarted
* SyncCompleted
* SyncFailed
* NotificationCreated

Events flow through:

```text
Content Script
        │
        ▼
Event Bus
        │
        ▼
Queue Manager
        │
        ▼
API Client
        │
        ▼
Backend
```

---

# 8. Offline Queue

The extension must never lose events.

Workflow:

```text
Event Created
      │
      ▼
Persist Locally
      │
      ▼
Attempt Sync
      │
      ├── Success → Remove from Queue
      └── Failure → Retry Later
```

Queue items include:

* Event ID
* Timestamp
* Event Type
* Payload
* Retry Count
* Sync Status

---

# 9. Synchronization Strategy

Synchronization must be:

* Idempotent
* Retryable
* Ordered where required
* Resilient to network interruptions

Use exponential backoff for retries and unique event IDs to prevent duplicates.

---

# 10. Authentication

Dashboard

* Email/Password
* Google OAuth
* JWT Access Token
* Refresh Token

Extension

* Authenticates with the backend using the user's CodeXCareer token.
* Does not store or manage third-party job platform credentials.

---

# 11. Data Model (High Level)

Collections:

* Users
* Profiles
* Resumes
* Applications
* Activities
* Notifications
* Devices
* Settings
* ExtensionLogs
* AnalyticsSnapshots

---

# 12. API Design Principles

All APIs must:

* Validate input
* Authenticate requests
* Authorize access
* Return consistent response format
* Be versioned
* Be documented

Response format:

```json
{
  "success": true,
  "message": "Operation completed",
  "data": {},
  "error": null
}
```

---

# 13. State Management

Dashboard

* React Query for server state
* Zustand for client state

Extension

* Local state
* chrome.storage for persistence
* Background service worker as coordinator

---

# 14. Error Handling

Handle:

* Network failure
* Session expiry
* API timeout
* Browser restart
* Storage failure
* Unexpected exceptions

Every error should:

* Be logged
* Have a user-facing message where appropriate
* Be recoverable when possible

---

# 15. Logging & Observability

Capture:

* API requests
* Queue metrics
* Sync latency
* Extension version
* Browser version
* Error counts
* Retry counts
* User actions

Use structured logging.

---

# 16. Security

Requirements:

* HTTPS everywhere
* JWT authentication
* Password hashing with bcrypt
* Input validation
* Rate limiting
* Helmet
* CORS
* Secure file uploads
* Least-privilege access

Do not store:

* Third-party account passwords
* Third-party session cookies
* Browser authentication tokens belonging to external platforms

---

# 17. Performance

Goals:

* Dashboard load < 2 seconds
* API response < 300 ms under normal load
* Efficient pagination
* Lazy loading
* Indexed MongoDB queries
* Redis caching for frequently accessed data

---

# 18. Scalability

Target:

* 100,000+ users
* Millions of application events

Strategies:

* Horizontal API scaling
* Redis caching
* BullMQ workers
* Efficient indexing
* CDN for static assets

---

# 19. Folder Structure

```text
root/

client/
server/
extension/
shared/
docs/
scripts/
docker/
```

Each project should use feature-based organization.

---

# 20. Design Decisions

* MERN stack for rapid development and ecosystem maturity.
* Manifest V3 for Chrome extension compatibility.
* MongoDB for flexible document storage.
* Redis for caching and queue support.
* BullMQ for reliable background processing.
* Socket.IO for real-time dashboard updates.
* Platform Adapter pattern for maintainable multi-platform support.
* Event-driven synchronization for reliability and extensibility.

---

# 21. Risks

Primary risks:

* Changes to third-party website interfaces.
* Changes to browser extension APIs.
* Network interruptions.
* Synchronization failures.
* Large event volumes.

Mitigations:

* Adapter abstraction.
* Selector registry.
* Offline queue.
* Retry engine.
* Monitoring and alerting.

---

# 22. Success Criteria

The system is considered successful when:

* Users complete onboarding with minimal friction.
* Application events synchronize reliably.
* Dashboard data remains accurate.
* The extension recovers from failures without data loss.
* The architecture supports adding new job platforms with minimal changes.
* The codebase remains modular, testable, and maintainable as the product grows.
