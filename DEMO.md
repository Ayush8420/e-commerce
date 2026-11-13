# AetherMart — Live Hackathon Demo Walkthrough

This click-by-click script guides evaluators and judges through **AetherMart**, demonstrating how **Aiven for PostgreSQL**, **Aiven for Apache Kafka**, and **Aiven for OpenSearch** power an omnichannel physical-store retail chain across India transitioning online.

---

## Prerequisites (30 Seconds Setup)

Make sure services are running:
```bash
# Verify monorepo builds and tests pass
npm test
npm run build

# Start services (dev mode)
npm run dev
```
- **Storefront**: [http://localhost:3000](http://localhost:3000)
- **Live System Monitor**: [http://localhost:3000/system](http://localhost:3000/system)
- **API Health**: [http://localhost:4000/api/health](http://localhost:4000/api/health)

---

## Click-by-Click Demo Script (4 Minutes)

### Step 1: Typo-Tolerant Search Powered by Aiven OpenSearch (30s)
1. Open [http://localhost:3000/products](http://localhost:3000/products).
2. In the search bar, deliberately misspell a product:
   - Type **`bluetoth`** &rarr; OpenSearch matches *Sony WH-1000XM5 Wireless Headphones*.
   - Type **`samsng`** &rarr; OpenSearch matches *Samsung Galaxy*.
   - Type **`mobail`** &rarr; OpenSearch matches smartphones.
3. **What to point out to judges**:
   - Point to the green badge in the header: **`⚡ Served by OpenSearch in 3 ms`**.
   - Show that `fuzziness: "AUTO"` with `prefix_length: 1` prevents cold zero-result searches even with aggressive Indian English typos.

---

### Step 2: Physical Store Inventory & City Availability (45s)
1. On the `/products` catalog page, look at the left sidebar under **"City Store Stock"**.
2. Notice the live term aggregation count next to each Indian city (*Mumbai, Bengaluru, Delhi, Pune, Hyderabad, Chennai, Kolkata, Ahmedabad*).
3. Click **"Mumbai"**:
   - Notice the URL updates to `?city=Mumbai`.
   - The results instantly filter down to products physically present in Mumbai retail branches.
4. Click on any product, e.g., **Sony WH-1000XM5**:
   - Scroll down to the **"Physical Store Availability"** section.
   - Point out the real-time stock breakdown across store branches in Mumbai (Bandra, Lower Parel), Bengaluru (Indiranagar), Delhi (Connaught Place), etc.

---

### Step 3: Atomic Checkout with UPI QR & Row-Level Protection (60s)
1. On the product page, click **"Add to Bag"**.
2. Open the cart drawer, click **"Proceed to Checkout"**.
3. Click **"Fill Demo Address"** (auto-fills Mumbai or Bengaluru shipping address).
4. Select **UPI QR / VPA** payment method.
5. Click **"Pay with UPI"**:
   - A dynamic NPCI UPI QR code and deep-link are generated.
6. Open [http://localhost:3000/system](http://localhost:3000/system) in a side-by-side browser window.
7. Return to checkout and click **"Simulate UPI App Scan & Pay"**:
   - Payment is verified immediately, stock is conditionally decremented inside an atomic PostgreSQL transaction, and an outbox event is enqueued.

---

### Step 4: Live Observability Pipeline at `/system` (45s)
1. In [http://localhost:3000/system](http://localhost:3000/system), observe the real-time event feed:
   - **PostgreSQL**: `order_saved_postgres` &rarr; Order `ORD-...` recorded and store inventory locked atomically.
   - **Kafka Outbox Relay**: `kafka_event_published` &rarr; Relayed to topic `order.events` (partition 0, offset X).
   - **Kafka Consumer**: `kafka_consumer_received` &rarr; `OrderConsumer` processes order confirmation with idempotent `ProcessedEvent` deduplication (replay-safe).
   - **OpenSearch Sync**: `opensearch_doc_indexed` &rarr; `CatalogConsumer` updates the OpenSearch document's stock and available cities.
   - **Email Notification**: `email_notification_sent` &rarr; Nodemailer dispatches order confirmation email.
2. **What to point out to judges**:
   - Every single asynchronous step is visible with timestamps and millisecond latencies.
   - Idempotency guarantees that even if Kafka replays a message, stock is **never double-decremented** and emails are **never double-sent**.

---

### Step 5: Concurrency Stress Test — 100 Buyers vs 5 Units (60s)
*This is the definitive technical proof that Aiven PostgreSQL prevents overselling under heavy load.*

1. On the `/system` page, locate the **"Oversell Concurrency Proof"** card on the right.
2. Leave defaults set:
   - **Concurrent Buyers**: `100`
   - **Initial Stock**: `5`
3. Click **"🚀 Fire 100 Concurrent Purchases"**.
4. Within ~350ms, review the live results card:
   - **Total Purchase Attempts**: `100`
   - **Successful Purchases**: **`5`** (won the available stock)
   - **Sold-Out Rejections**: **`95`** (rejected with 0 rows affected)
   - **Final Database Stock**: **`0`** (never negative!)
   - **Banner**: **`ZERO OVERSELL: Aiven PostgreSQL Protected Inventory!`**
5. **Technical Explanation for Judges**:
   ```sql
   UPDATE "Inventory"
   SET quantity = quantity - 1
   WHERE "productId" = $1 AND "storeId" = $2 AND quantity >= 1;
   ```
   PostgreSQL enforces row-level exclusive locks during this atomic statement. If `quantity < 1`, zero rows are modified, rolling back that transaction immediately. Concurrent buyers can **never oversell the last unit**.

---

## Summary of Aiven Services in Action

| Service | Real Work Demonstrated in Demo |
| :--- | :--- |
| **Aiven for PostgreSQL** | Source of truth, relational integrity, row-level atomic locks preventing 100 concurrent buyers from overselling 5 units, transactional outbox storage. |
| **Aiven for Apache Kafka** | Decoupled event bus across 4 topics (`order.events`, `catalog.events`, `notification.events`, `analytics.events`) with idempotent consumer deduplication. |
| **Aiven for OpenSearch** | Typo tolerance (`"bluetoth"`, `"samsng"`), sub-5ms search queries, facet aggregation across 8 Indian cities, dynamic stock sync. |
