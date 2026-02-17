# Interview Guide — Order System Debugging Exercise

> **CONFIDENTIAL** — This document is for the interviewer only. Do not share with candidates.

## Overview

This project is a microservices-based order system with **2 intentional issues** focused on **distributed system and inter-service communication awareness**. Two FastAPI backends (Order Service, Inventory Service) communicate via REST, and bugs emerge from how they handle failures and data ownership.

The app includes proper input validation and error handling for direct user actions — the bugs are specifically in the inter-service interaction patterns.

---

## Intentional Issues

### Issue 1: Order Confirmed Despite Insufficient Stock (Distributed Consistency)

**Location**: `order-service/app/main.py`, `create_order` endpoint (~line 105)

**Bug**: When placing an order, the Order Service creates an order record with status "confirmed" in its database **before** calling the Inventory Service to reserve stock. If the Inventory Service returns an error (insufficient stock), the Order Service catches the error, logs it, and continues — the order record remains "confirmed" in the database and is returned to the frontend.

This means: the user can order 100 units of a product with 3 in stock. The order appears as "confirmed" in order history, but the stock was never decremented.

**How to reproduce**:
1. Note "Webcam HD" has 3 in stock
2. Place an order for 10 units of "Webcam HD"
3. The order appears in the history as "confirmed" with a total based on 10 units
4. But the product still shows 3 in stock (stock was never decremented)
5. The README states: "Orders are only confirmed when inventory is successfully reserved"

**Root cause**: Order record is persisted before the inventory call, and the inventory error doesn't trigger rollback/cancellation.

**Fix** (best approach — reserve first, then create):
```python
@app.post("/api/orders", status_code=201)
def create_order(order: OrderCreate, db: Session = Depends(get_db)):
    product = _fetch_product(order.product_id)
    if product["price"] == 0:
        raise HTTPException(status_code=400, detail="Could not verify product")

    # Reserve inventory FIRST
    try:
        reserve_resp = httpx.post(
            f"{INVENTORY_URL}/api/products/{order.product_id}/reserve",
            json={"quantity": order.quantity},
            timeout=5.0,
        )
        reserve_resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        error_detail = e.response.json().get("detail", "Inventory error")
        raise HTTPException(status_code=400, detail=error_detail)
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Inventory service unavailable")

    # Stock reserved — now create the order
    db_order = Order(
        product_id=order.product_id,
        quantity=order.quantity,
        status="confirmed",
        created_at=datetime.utcnow(),
    )
    db.add(db_order)
    db.commit()
    db.refresh(db_order)
    return _enrich_order(db_order)
```

**Alternative fix** (compensating transaction — create as "pending", confirm after reserve, cancel on failure):
```python
db_order = Order(..., status="pending")
db.add(db_order)
db.commit()

try:
    reserve_resp = httpx.post(...)
    reserve_resp.raise_for_status()
    db_order.status = "confirmed"
except:
    db_order.status = "cancelled"
db.commit()
```

**What this tests**:
- Distributed systems consistency (partial failure handling)
- Understanding of operation ordering in multi-service transactions
- Knowledge of patterns: saga, compensating transactions, reserve-then-commit
- Error propagation across service boundaries

**Signals of a strong candidate**:
- Immediately notices stock didn't change after ordering excess quantity
- Traces the issue to the Order Service ignoring the inventory error
- Proposes the "reserve first" pattern or a compensating transaction
- Discusses saga pattern or two-phase commit in the context of real systems

**Signals of a weak candidate**:
- Doesn't test ordering more than available stock
- Assumes the Inventory Service is at fault
- Patches it by adding a stock check on the frontend (doesn't solve the core issue)

---

### Issue 2: Order Totals Computed Live Instead of Snapshotted (Data Ownership / Denormalization)

**Location**: `order-service/app/models.py` and `order-service/app/main.py` (`_enrich_order` helper, ~line 72)

**Bug**: The Order model only stores `product_id` and `quantity` — it does NOT store the product name, unit price, or total at order time. When listing orders, the `_enrich_order` helper fetches the **current** product details from the Inventory Service and computes the total using the current price. This means: if a product's price changes, all historical orders retroactively show the new price and a different total.

**How to reproduce**:
1. Place an order for 2 units of "USB-C Hub" at $49.99 → total shows $99.98
2. Open the Inventory Service Swagger UI at http://localhost:8002/docs
3. Use PATCH /api/products/3 to change the price to $69.99
4. Refresh the frontend → the same order now shows total $139.98
5. The README states: "Order totals reflect the price at the time of purchase... must not change retroactively"

**Root cause**: The Order model has no `product_name`, `unit_price`, or `total` columns. The `_enrich_order` function re-fetches product data on every request.

**Fix**:
1. Add columns to the Order model:
```python
class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, nullable=False)
    product_name = Column(String(200), nullable=False)
    unit_price = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False)
    total = Column(Float, nullable=False)
    status = Column(String(20), default="confirmed")
    created_at = Column(DateTime, default=datetime.utcnow)
```

2. Populate them at order creation time from the Inventory Service response.

3. When listing orders, use the stored snapshot instead of re-fetching.

This also eliminates the N+1 HTTP call problem (each order listing currently makes one HTTP call per order to the Inventory Service).

**What this tests**:
- Data ownership in distributed systems
- Denormalization and event sourcing concepts
- Understanding of why services should own their data snapshots
- Performance awareness (N+1 inter-service calls)

**Signals of a strong candidate**:
- Examines the Order model and notices no price/name columns
- Realizes the order list makes N+1 calls to the Inventory Service (visible in network tab or server logs)
- Proposes storing a snapshot at order time
- Discusses data ownership boundaries between services
- May reference event sourcing, CQRS, or materialized views

**Signals of a weak candidate**:
- Doesn't think to test price changes
- Assumes the Order Service "should" call the Inventory Service for product details
- Doesn't notice the N+1 pattern

---

## Grading Rubric

### Scoring (out of 20 points)

| Category | Points | Criteria |
|----------|--------|----------|
| **Issue Discovery** | 4 | Found Issue 1 (2 pts), Found Issue 2 (2 pts) |
| **Root Cause Analysis** | 4 | Correctly identified root cause for each issue found |
| **Fix Quality** | 4 | Fix is correct, minimal, and follows distributed system best practices |
| **Distributed Systems Reasoning** | 4 | Discussed patterns (saga, compensation, data ownership, denormalization, N+1) |
| **Communication** | 4 | Clear explanation of debugging process, trade-offs, and how they'd handle this in production (message queues, event-driven architecture) |

### Rating Scale

| Score | Rating | Description |
|-------|--------|-------------|
| 17–20 | **Strong Hire** | Found both issues, excellent fixes, deep distributed systems discussion |
| 13–16 | **Hire** | Found both issues, good fixes, some distributed systems discussion |
| 9–12 | **Lean Hire** | Found 1 issue, fix mostly correct, limited architecture discussion |
| 5–8 | **Lean No Hire** | Found 1 issue with guidance, struggled with distributed concepts |
| 0–4 | **No Hire** | Unable to find issues or understand inter-service communication |

---

## Interview Flow Suggestion

1. **Setup (5 min)**: Candidate runs `docker compose up --build`, receives the README. Point out there are two backends.
2. **Exploration (5 min)**: Browse products, place an order, check order history
3. **Debugging (30–35 min)**: Discover and fix issues
4. **Discussion (15–20 min)**: Distributed system trade-offs, how they'd redesign this with a message queue, what failure modes would change with async communication, saga orchestration, event sourcing

The extended discussion time (vs other scenarios) is intentional — with 2 bugs, the saved debugging time shifts to architecture discussion, which is the primary evaluation axis for this scenario.

### Hints (use sparingly)

| Strength | Issue 1 | Issue 2 |
|----------|---------|---------|
| **Mild** | "Try ordering more units than a product has in stock. What happens?" | "Place an order, then change the product's price via the Inventory Service Swagger at :8002/docs. What happens to the order total?" |
| **Medium** | "Check the Order Service code — what happens if the Inventory Service rejects the stock reservation?" | "Look at the Order model. What fields does it store? Where does the product name and price come from when listing orders?" |
| **Strong** | "The order is created BEFORE the inventory reservation. What if the reservation fails?" | "The Order Service re-fetches current product prices for every order listing. What if prices changed?" |
