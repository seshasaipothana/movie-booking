# Movie Booking System - Complete Learning Guide
## Everything Explained Line by Line

**Author:** Seshasayee Pothana  
**Purpose:** Full understanding of what we built and why  
**Date:** May 2026

---

# TABLE OF CONTENTS

1. [What Are We Building?](#1-what-are-we-building)
2. [Why These Technologies?](#2-why-these-technologies)
3. [Concepts You Must Understand](#3-concepts-you-must-understand)
4. [Database Design - Start Here](#4-database-design)
5. [Backend File-by-File](#5-backend-file-by-file)
6. [Frontend File-by-File](#6-frontend-file-by-file)
7. [How Everything Connects](#7-how-everything-connects)
8. [Common Mistakes Explained](#8-common-mistakes-explained)

---

# 1. WHAT ARE WE BUILDING?

## The Problem

Imagine you're building BookMyShow. When 1000 people try to book the same seat at the same time, how do you make sure only ONE person gets it?

## The Solution

A movie booking app with:
- Users can see movies and showtimes
- Click seats on a visual seat map
- When you click a seat, it **locks for 5 minutes** so nobody else can take it
- Other users see your locked seats in **real-time**
- When you confirm, the seat is permanently booked

## The Core Challenge

**Race Condition Prevention**

WITHOUT LOCKS:
Time 0:00 - User A sees seat 5 is available
Time 0:01 - User B sees seat 5 is available
Time 0:02 - User A books seat 5
Time 0:03 - User B books seat 5  ← PROBLEM! Double booking!
WITH LOCKS:
Time 0:00 - User A clicks seat 5 → LOCKED in Redis
Time 0:01 - User B tries to click seat 5 → ERROR: "Already held"
Time 0:02 - User A confirms booking → Permanently booked
Time 0:03 - User B sees seat 5 is now gray (booked)

---

# 2. WHY THESE TECHNOLOGIES?

## Technology Stack Overview

┌─────────────────────────────────────────────┐
│           WHAT THE USER SEES                │
│   React (JavaScript library for UI)        │
│   + TypeScript (adds types to JavaScript)  │
│   + Tailwind (styling)                      │
└──────────────┬──────────────────────────────┘
│
│ HTTP/WebSocket
│
┌──────────────▼──────────────────────────────┐
│          BACKEND (SERVER)                   │
│   FastAPI (Python web framework)            │
│   + SQLAlchemy (talk to database)           │
│   + Redis (temporary seat locks)            │
└──────────────┬──────────────────────────────┘
│
┌──────┴──────┐
│             │
┌───────▼───────┐ ┌──▼────────┐
│  PostgreSQL   │ │   Redis   │
│  (Permanent   │ │ (5-minute │
│   data)       │ │  locks)   │
└───────────────┘ └───────────┘

## Why Each Technology?

### React
**What it is:** A library that makes building interactive UIs easy  
**Why we use it:** Updates the UI automatically when data changes  
**Alternative we rejected:** Vanilla JavaScript (too much manual DOM manipulation)

**Example:**
```javascript
// Without React (manual)
document.getElementById('seat-5').classList.add('selected')
document.getElementById('seat-5').innerText = 'Selected'

// With React (automatic)
setSelectedSeats([...selectedSeats, 5])  // UI updates automatically!
```

### TypeScript
**What it is:** JavaScript + type checking  
**Why we use it:** Catches bugs before running code  
**Alternative we rejected:** Plain JavaScript (no type safety)

**Example:**
```typescript
// TypeScript catches this error:
function bookSeat(seatId: number) {
  // ...
}
bookSeat("five")  // ❌ ERROR: Expected number, got string

// JavaScript allows this bug:
function bookSeat(seatId) {
  // ...
}
bookSeat("five")  // ✅ Runs, breaks later!
```

### FastAPI
**What it is:** Python web framework for building APIs  
**Why we use it:** Async (handles 1000s of requests), auto-generates docs  
**Alternative we rejected:** Django (not async-first, too heavy)

**Example:**
```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/movies")
async def get_movies():
    return [{"title": "Interstellar"}]

# Visit /docs → Automatic interactive API documentation!
```

### PostgreSQL
**What it is:** Relational database (stores data in tables)  
**Why we use it:** ACID transactions (all-or-nothing operations), foreign keys  
**Alternative we rejected:** MongoDB (no transactions, weak data integrity)

**Example of why transactions matter:**
```python
# Book a seat - either EVERYTHING succeeds or NOTHING changes
async with db.begin():
    create_booking()         # Step 1
    charge_payment()         # Step 2
    send_confirmation()      # Step 3
    # If Step 3 fails, Steps 1 & 2 are rolled back!
```

### Redis
**What it is:** In-memory key-value store (super fast cache)  
**Why we use it:** Sub-millisecond speed, automatic expiration (TTL)  
**Alternative we rejected:** Database (too slow for temporary locks)

**Example:**
```python
# Lock seat 5 for 5 minutes
redis.set("seat_lock:77:5", user_id, ex=300)

# After 5 minutes, Redis automatically deletes it!
```

### SQLAlchemy
**What it is:** ORM (Object-Relational Mapper) - write Python instead of SQL  
**Why we use it:** Type-safe queries, relationship management  
**Alternative we rejected:** Raw SQL (too much boilerplate, no type safety)

**Example:**
```python
# SQLAlchemy (Pythonic)
booking = await db.get(Booking, 1)
print(booking.user.email)  # Automatic JOIN

# Raw SQL (verbose)
result = await db.execute("""
    SELECT users.email 
    FROM bookings 
    JOIN users ON bookings.user_id = users.id 
    WHERE bookings.id = 1
""")
print(result.scalar())
```

---

# 3. CONCEPTS YOU MUST UNDERSTAND

## Concept 1: Async vs Sync

### Synchronous (Blocking)
```python
# Bad: Blocks entire server
def get_movies():
    result = database_query()  # Takes 50ms
    # During those 50ms, no other requests can be handled
    return result

# Server can handle: ~20 requests/second
```

### Asynchronous (Non-blocking)
```python
# Good: Releases control while waiting
async def get_movies():
    result = await database_query()  # Takes 50ms
    # During those 50ms, server handles OTHER requests
    return result

# Server can handle: ~1000 requests/second
```

**Analogy:**
- **Sync:** You call a restaurant, they put you on hold, you wait doing nothing
- **Async:** You call a restaurant, they say "we'll call you back", you do other things

## Concept 2: Database Transactions

### Without Transactions (Bad)
```python
create_booking()      # ✅ Succeeds
charge_payment()      # ❌ Fails (card declined)
# Result: Booking created but not paid! Inconsistent state!
```

### With Transactions (Good)
```python
async with db.begin():  # Start transaction
    create_booking()
    charge_payment()    # Fails
    # Transaction rolls back - booking is deleted automatically
```

**Analogy:** Either you buy ALL items in your cart or NONE. Can't have partial checkout.

## Concept 3: Foreign Keys

**Without Foreign Keys:**
```sql
bookings: id=1, showtime_id=999  ← showtime 999 doesn't exist!
-- Database allows this garbage data
```

**With Foreign Keys:**
```sql
bookings: id=1, showtime_id=999
-- ERROR: Foreign key constraint violation
-- Must reference an existing showtime
```

**Analogy:** You can't book a flight that doesn't exist.

## Concept 4: JWT Authentication

**How it works:**

1. User logs in with email/password
                    ↓
2. Server creates a JWT token containing user_id
    Token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    ↓
3. Browser stores token in localStorage
                    ↓
4. Every request includes: Authorization: Bearer <token>
                    ↓
5. Server decodes token to get user_id
    No database lookup needed!

**Token structure:**

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9  ← Header (algorithm)
.
eyJ1c2VyX2lkIjoxMjN9                  ← Payload (user_id: 123)
.
signature_here                         ← Signature (tamper-proof)

## Concept 5: WebSockets

**HTTP (Old way - Polling):**

Browser: "Any updates?" (request every second)
Server: "No"
Browser: "Any updates?"
Server: "No"
Browser: "Any updates?"
Server: "Yes! Seat 5 was booked"

Wasteful! 100 requests to get 1 update

**WebSocket (New way):**

Browser ←──────→ Server (persistent connection)
Server: "Seat 5 locked!"  ← Pushed to browser instantly
Browser updates UI
Efficient! Server pushes updates when they happen

---

# 4. DATABASE DESIGN - START HERE

## Why Database First?

**Always design database BEFORE writing code!**

Your database is your **source of truth**. All application logic revolves around it.

## Step-by-Step Database Design

### Step 1: Identify Entities (Nouns)

From requirements, extract nouns:
- User
- Movie
- Cinema
- Screen
- Seat
- Showtime
- Booking

### Step 2: Define Relationships

User ---< Booking       (One user has many bookings)
Movie ---< Showtime     (One movie has many showtimes)
Screen ---< Seat        (One screen has many seats)
Showtime ---< Booking   (One showtime has many bookings)
Booking >---< Seat      (Many-to-many: junction table needed)

### Step 3: Create Tables

#### users
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why each column:**
- `id`: Unique identifier (auto-increments: 1, 2, 3...)
- `email UNIQUE`: No duplicate accounts
- `hashed_password`: NEVER store plain passwords (security)
- `name`: Display name
- `created_at`: When account was created

#### movies
```sql
CREATE TABLE movies (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why each column:**
- `CHECK (duration_minutes > 0)`: Business rule - movies can't be 0 minutes

#### showtimes
```sql
CREATE TABLE showtimes (
    id SERIAL PRIMARY KEY,
    movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    screen_id INTEGER NOT NULL REFERENCES screens(id),
    start_time TIMESTAMP NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why each column:**
- `movie_id REFERENCES movies(id)`: Foreign key - must be a valid movie
- `ON DELETE CASCADE`: If movie deleted, delete its showtimes too
- `NUMERIC(10, 2)`: Money type - 2 decimal places (e.g., 199.99)

#### bookings
```sql
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    showtime_id INTEGER NOT NULL REFERENCES showtimes(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    total_amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### booking_seats (Junction Table)
```sql
CREATE TABLE booking_seats (
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    seat_id INTEGER NOT NULL REFERENCES seats(id),
    PRIMARY KEY (booking_id, seat_id)
);
```

**Why junction table?**

Without it, you can't represent many-to-many:

### Step 3: Create Tables

#### users
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why each column:**
- `id`: Unique identifier (auto-increments: 1, 2, 3...)
- `email UNIQUE`: No duplicate accounts
- `hashed_password`: NEVER store plain passwords (security)
- `name`: Display name
- `created_at`: When account was created

#### movies
```sql
CREATE TABLE movies (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why each column:**
- `CHECK (duration_minutes > 0)`: Business rule - movies can't be 0 minutes

#### showtimes
```sql
CREATE TABLE showtimes (
    id SERIAL PRIMARY KEY,
    movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    screen_id INTEGER NOT NULL REFERENCES screens(id),
    start_time TIMESTAMP NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why each column:**
- `movie_id REFERENCES movies(id)`: Foreign key - must be a valid movie
- `ON DELETE CASCADE`: If movie deleted, delete its showtimes too
- `NUMERIC(10, 2)`: Money type - 2 decimal places (e.g., 199.99)

#### bookings
```sql
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    showtime_id INTEGER NOT NULL REFERENCES showtimes(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    total_amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### booking_seats (Junction Table)
```sql
CREATE TABLE booking_seats (
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    seat_id INTEGER NOT NULL REFERENCES seats(id),
    PRIMARY KEY (booking_id, seat_id)
);
```

**Why junction table?**

Without it, you can't represent many-to-many:

### Step 3: Create Tables

#### users
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why each column:**
- `id`: Unique identifier (auto-increments: 1, 2, 3...)
- `email UNIQUE`: No duplicate accounts
- `hashed_password`: NEVER store plain passwords (security)
- `name`: Display name
- `created_at`: When account was created

#### movies
```sql
CREATE TABLE movies (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why each column:**
- `CHECK (duration_minutes > 0)`: Business rule - movies can't be 0 minutes

#### showtimes
```sql
CREATE TABLE showtimes (
    id SERIAL PRIMARY KEY,
    movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    screen_id INTEGER NOT NULL REFERENCES screens(id),
    start_time TIMESTAMP NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why each column:**
- `movie_id REFERENCES movies(id)`: Foreign key - must be a valid movie
- `ON DELETE CASCADE`: If movie deleted, delete its showtimes too
- `NUMERIC(10, 2)`: Money type - 2 decimal places (e.g., 199.99)

#### bookings
```sql
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    showtime_id INTEGER NOT NULL REFERENCES showtimes(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    total_amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### booking_seats (Junction Table)
```sql
CREATE TABLE booking_seats (
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    seat_id INTEGER NOT NULL REFERENCES seats(id),
    PRIMARY KEY (booking_id, seat_id)
);
```

**Why junction table?**

Without it, you can't represent many-to-many:

### Step 3: Create Tables

#### users
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why each column:**
- `id`: Unique identifier (auto-increments: 1, 2, 3...)
- `email UNIQUE`: No duplicate accounts
- `hashed_password`: NEVER store plain passwords (security)
- `name`: Display name
- `created_at`: When account was created

#### movies
```sql
CREATE TABLE movies (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why each column:**
- `CHECK (duration_minutes > 0)`: Business rule - movies can't be 0 minutes

#### showtimes
```sql
CREATE TABLE showtimes (
    id SERIAL PRIMARY KEY,
    movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    screen_id INTEGER NOT NULL REFERENCES screens(id),
    start_time TIMESTAMP NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why each column:**
- `movie_id REFERENCES movies(id)`: Foreign key - must be a valid movie
- `ON DELETE CASCADE`: If movie deleted, delete its showtimes too
- `NUMERIC(10, 2)`: Money type - 2 decimal places (e.g., 199.99)

#### bookings
```sql
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    showtime_id INTEGER NOT NULL REFERENCES showtimes(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    total_amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### booking_seats (Junction Table)
```sql
CREATE TABLE booking_seats (
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    seat_id INTEGER NOT NULL REFERENCES seats(id),
    PRIMARY KEY (booking_id, seat_id)
);
```

**Why junction table?**

Without it, you can't represent many-to-many:
