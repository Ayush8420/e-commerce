# AetherMart — Event-Driven E-Commerce Platform

Full-stack e-commerce application built with **Next.js 16**, **NestJS 12**, **PostgreSQL + Prisma**, **Apache Kafka (KRaft)**, **OpenSearch**, **UPI QR / VPA Checkout**, **Email + Google OAuth**, and **Transactional Email Notifications**.

## Architecture

- **Frontend (`apps/web`)**: Next.js App Router + Tailwind CSS v4 with live OpenSearch autocomplete, faceted search sidebar, product reviews, persistent guest/DB cart merge, UPI QR & VPA checkout sheet, order tracking timeline, and Admin Console.
- **Backend (`apps/api`)**: NestJS modular API with Prisma ORM, JWT access + HttpOnly refresh token rotation, Google OAuth 2.0, atomic stock reservation, UPI deep-link/QR generator (`qrcode`), and Razorpay webhook support.
- **Shared (`packages/shared`)**: Shared TypeScript contracts, Kafka topic definitions, INR formatting, and NPCI UPI deep-link helpers.
- **Event-Driven Kafka + Outbox Pipeline**:
  - `catalog.events` — PostgreSQL product/stock/rating mutations enqueue `OutboxEvent` rows relayed to Kafka; `CatalogConsumer` syncs documents to OpenSearch.
  - `order.events` — Checkout, UPI verification/failure, cancellation, and admin status changes drive `OrderConsumer`.
  - `notification.events` — `NotificationConsumer` delivers HTML/text transactional emails via Nodemailer (`Mailpit` in dev, SMTP in prod) with idempotent `NotificationLog` deduplication.
  - `analytics.events` — Captures `search.performed`, `product.viewed`, `cart.item_added`, `checkout.started`, and `order.completed`.

## Quick Start

1. **Start infrastructure (Docker Desktop / WSL2)**:
   ```bash
   docker compose up -d
   ```
   Services started:
   - PostgreSQL: `localhost:5432`
   - Kafka (KRaft): `localhost:9092`
   - OpenSearch: `http://localhost:9200`
   - Mailpit SMTP & Web UI: `localhost:1025` / `http://localhost:8025`
   - Optional Kafka UI: `docker compose --profile tools up -d` (`http://localhost:8080`)

2. **Install dependencies & configure env**:
   ```bash
   npm install
   cp .env.example .env
   ```
   - **Gmail SMTP (Nodemailer)**: Enable 2-Step Verification on your Google account, generate a 16-character **App Password**, and set `SMTP_USER="you@gmail.com"`, `SMTP_PASS="your-app-password"`, and `SMTP_FROM="AetherMart <you@gmail.com>"` in `.env` (keep `SMTP_SERVICE="gmail"`, `SMTP_HOST="smtp.gmail.com"`, `SMTP_PORT=465`, `SMTP_SECURE=true`).
   - *(Optional)* Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` with authorized redirect URI `http://localhost:4000/api/auth/google/callback` to enable live Google Sign-In.

3. **Push Prisma schema & seed sample catalog**:
   ```bash
   npm run db:generate
   npm run db:push
   npm run db:seed
   ```

4. **Start frontend + backend**:
   ```bash
   npm run dev
   ```
   - Storefront: `http://localhost:3000`
   - API: `http://localhost:4000/api/health`
   - Mailpit Email Inbox: `http://localhost:8025`

## Seeded Accounts & Promo Codes

- **Customer**: `customer@aethermart.local` / `Customer@12345`
- **Admin**: `admin@aethermart.local` / `Admin@12345`
- **Promo Codes**: `WELCOME10`, `FLAT500`, `UPIFIRST`

## Verification Commands

```bash
npm run build
npm test
```

