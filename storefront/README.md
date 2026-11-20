# COPA storefront

The customer-facing half of the system. Production source stays private. This page is what that shop did.

## Stack

- **Next.js** storefront
- **Vendure** GraphQL API, admin dashboard, and SQLite catalog
- Meal builder, cart, checkout, and pickup slots
- Card payments through Square while the shop was live
- One host behind nginx while it was deployed

The shop stopped taking orders in August 2026. The AWS instance was shut down in September 2026. There is no live demo to click.

## What a customer could do

Build a meal from protein, side, and carb. A meal could be partial as long as one slot was filled. The page rolled nutrition up from per-variant fields and showed menu notes written in the admin catalog. An optional kitchen note was copied onto each line in that meal group so the kitchen saw it on the line, not only on the order header.

Checkout used the active order window. Outside the window the shop stopped taking orders for the wrong fulfillment week. Labels used Central time.

## What the server wrote down

On settled payment the server did two things beyond the database row:

1. Appended one TSV line per order line: customer, pickup, meal id, item name, quantity, nutrition string, and gross–tax–discount.
2. Appended a tax-sales row for the order.

Those files are the contract with CABANA. A later push turned the live spool into `_LOCK_<timestamp>_orders.tsv` and kept an archive copy. The kitchen imported the lock file. The storefront never wrote the recipe tables, and CABANA never took the card payment.

## What stayed in the admin

Operators managed the meal catalog, nutrition, tax category versus the channel’s default tax zone, and the order pool before a push. Catalog rows could move in and out as TSV, matched on SKU, so a menu correction did not mean editing variants by hand.

None of that admin surface, and none of the production database, is in this repository.
