# AetherMart — 2-Minute Hackathon Pitch

**Tagline:** Transforming physical retail chains across India into high-concurrency, typo-tolerant digital storefronts powered by Aiven.

---

## 1. The Problem (30 Seconds)
Traditional physical retail chains across India (electronics, fashion, curated studio gear) are taking their catalog online to compete in the fast-growing e-commerce landscape. 

However, omnichannel retail introduces three mission-critical engineering hurdles:
1. **The Concurrency & Oversell Trap:** When a flash sale happens or the last unit of a flagship item is claimed, naive inventory updates create race conditions where two simultaneous buyers both get charged for the last item.
2. **Search Friction & Typos:** Indian mobile shoppers make phonetic typos every day (`bluetoth` instead of Bluetooth, `samsng` instead of Samsung, `mobail` instead of mobile). Standard SQL `LIKE` queries return zero results and lose the sale.
3. **Decoupled Physical Store Availability:** Customers in Mumbai need to know what is in stock at their local Bandra or Lower Parel store without querying slow monolithic backend endpoints.

---

## 2. The Solution & Architecture (45 Seconds)
We built **AetherMart**, a full-stack omnichannel platform designed around the **3 Aiven Cloud Services**:

```
[ Next.js 16 Storefront ]  <==>  [ NestJS API Gateway ]
           |                                |
           | (Typo Search & Aggs)           | (Atomic Row Locks & Outbox)
           v                                v
  [ Aiven OpenSearch ]            [ Aiven PostgreSQL ]
           ^                                |
           | (Catalog Sync)                 | (Relayed via Outbox)
           |                                v
           +======== [ Aiven Apache Kafka ] ========+
                                |
                                v
                   [ Idempotent Consumers ]
                   - Catalog Consumer (Search Sync)
                   - Order Consumer (Order Lifecycle)
                   - Notification Consumer (Nodemailer Email)
```

---

## 3. Why Each Aiven Service is Essential (30 Seconds)

### 1. Aiven for PostgreSQL (Source of Truth & Row-Level Concurrency Safety)
- Houses products, 16 physical store branches across 8 Indian cities, customers, and orders.
- Employs a single atomic conditional update:
  ```sql
  UPDATE "Inventory" 
  SET quantity = quantity - $n 
  WHERE "productId" = $p AND "storeId" = $s AND quantity >= $n;
  ```
- Combined with transaction isolation, if 100 concurrent shoppers attempt to purchase 5 available units, **exactly 5 succeed and 95 are rejected**. Stock never goes negative.

### 2. Aiven for Apache Kafka (Decoupled, Resilient Event Bus)
- Uses the **Transactional Outbox Pattern**: database mutations and event publications are saved together in one atomic Postgres transaction, preventing ghost orders and lost events.
- An asynchronous relay worker pushes events to 4 Kafka topics (`catalog.events`, `order.events`, `notification.events`, `analytics.events`).
- Consumers feature an idempotent `ProcessedEvent` deduplication layer, guaranteeing zero double-decrement of stock and zero duplicated customer emails during message replays.

### 3. Aiven for OpenSearch (Typo-Tolerant, City-Aware Search Engine)
- Indexes catalog items with `AUTO` fuzziness and prefix length guards across `title`, `brand`, `tags`, and `category`.
- A customer typing `bluetoth` or `samsng` immediately receives the correct product with sub-5ms response times.
- Aggregates real-time city stock facets (`availableCities`), allowing shoppers in Mumbai, Bengaluru, or Delhi to filter and browse stock physically available in their city.

---

## 4. Live Demo Highlights (15 Seconds)
1. **Instant Typo Search:** Watch `bluetoth` return Bluetooth earphones with a green badge: **`⚡ Served by OpenSearch in 3 ms`**.
2. **City Store Filter & Header Switcher:** Select **"Mumbai"** in the navbar to personalize the store and browse physical stock across Bandra and Lower Parel stores.
3. **Omnichannel Click &amp; Collect (BOPIS):** Choose Free In-Store Pickup in 2 hours with ₹0 shipping and receive an instant **Digital Store Pickup Pass** with a scannable QR code and verification PIN.
4. **Live Kafka Consumer Lag Visualizer:** Inspect committed offsets vs high watermarks across all 3 consumer groups at `/system`, proving **`Lag: 0 msgs (Real-Time)`**.
5. **Dynamic Flash Sale Broadcast:** Broadcast a 20% discount event via Kafka `catalog.events`, syncing OpenSearch sub-10ms.
6. **The Concurrency Proof Button (100 Concurrent Buyers vs 5 Units):** Click the admin stress-test button to fire 100 simultaneous checkouts. PostgreSQL row locks instantly reject 95 attempts, leaving final stock at exactly 0 with **Zero Oversell**.

