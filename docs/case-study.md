# COPA CABANA: operational analytics for a catering kitchen

**Daryl Trinidad** — owner and lead engineer, The COPA Kitchen.

The storefront ran in production through September 2026 and is offline. CABANA, the kitchen application, stays on the kitchen machine. This write-up is the public record of the system. The runnable sample uses invented data.

## 1. Summary

The COPA Kitchen runs a weekly meal-prep business in Houston. The e-commerce site is the front door, not the product. The product is an operational path from a customer order to a shopping list and a cook sheet.

A public Next.js storefront and a Vendure backend capture orders and nutrition-aware meal configurations. CABANA turns those orders into bill-of-materials demand, grocer cost, shopping lists, and fulfillment reports. Each step has a check: headers must match, units must match, and a missing cost is a visible gap rather than a silent zero.

## 2. Business problem

A catering kitchen has to answer the same questions an analytics team does. What did customers commit to? What ingredients and sub-recipes does that imply? What will it cost? What is already on hand? What must be bought, prepped, and cooked, and in what sequence?

Spreadsheets break when menus nest — a sauce inside a dish inside a meal — when units differ, and when a fulfillment week moves through received, cooking, packaged, and complete. Customers need nutrition and pickup instructions on the public site. Staff need a kitchen email in plain language and a prep sheet they can print.

## 3. Data architecture

**Commerce.** Vendure exposes a GraphQL API and an admin dashboard. SQLite holds products, variants, orders, and custom fields for meal role, per-variant nutrition, and kitchen notes. A meal-catalog extension manages proteins, sides, and carbs, including nutrition on each variant and tax categories aligned to the channel’s default tax zone.

The meal builder lets a customer compose a protein, a side, and a carb, including a partial meal when at least one slot is filled. It rolls nutrition up from the variants, shows operator-written menu notes as the customer-facing description, and copies an optional kitchen note onto each line in the meal group. Checkout collects a pickup slot and takes payment. When payment settles, the server appends TSV order lines: who the order is for, pickup context, meal id, item name, quantity, a compact nutrition string, and a gross–tax–discount tuple. A parallel tax-sales log stores gross, tax, discount, and net per order.

**Kitchen.** A React UI and an Express API read and write TSV tables in a data directory:

| Table | Role |
|-------|------|
| `FD_unitCost` | Grocer items, package size, cost per package, unit |
| `META_Recipes` | Menu items and sub-recipes, yield, unit, simmer flag |
| `RCP_MASTER` | Ingredient lines for each recipe |
| `Inventory` | Quantity on hand, package size, location |
| Orders | Status, customer fields, meal lines, nutrition, pricing |

Inventory package size stays aligned with the grocer package size on save. A history workspace records consumption after a successful stock-consume action.

**Handoff.** The live spool moves into a timestamped lock file. An archive copy is kept. CABANA imports that lock file into current orders, mapping older inbound layouts and the canonical twelve-column layout into one schema. Meal-menu components can also move as UTF-8 TSV, upserted by SKU, so catalog fixes do not mean hand-editing hundreds of variants. Admin views re-read the spool and the archive with the same header check before a push.

## 4. Analytics

**Costing.** The recipe calculator scales recipe quantities by batch yield: quantity asked ÷ recipe yield. It expands a sub-recipe when the units agree, detects cycles, and rolls cost from the grocer list only when the leaf unit matches. A mismatch is flagged. The calculator does not guess a conversion.

Simmer evaporation increases liquid leaf quantities when a recipe is marked simmer, using a loss rate and an output block size. Dish Builder composes a new menu item from grocer and menu typeahead, stages rows, and reports gaps: missing costs, blocked sub-recipes, menu lines with no grocer row. One save writes the recipe, its lines, and any new grocer rows together.

**Demand.** Kitchen demand includes lines whose status is blank or one of Received, Cook, or Package. Complete lines leave active demand. Each line matches `menu_item_name` to a recipe and explodes the nested BOM. The shopping list compares the required quantity with quantity on hand, computes the shortage, and turns that shortage into store packages and store dollars from the package size and package cost. A finished sub-recipe can net against inventory when its name and unit match an inventory row. Prep and cook views print per-recipe breakdowns and cook blocks in kitchen sequence.

**Reporting.** The MACRO workspace summarizes the week: meal totals, proteins, sides, carbs, and package compositions. Operators import lock files in timestamp order and advance status through the cycle. A monthly report joins tax-sales rows for a UTC month with a kitchen expense export and warns when an input is missing. Catering keeps a separate bulk queue. The calculator can send a batch into that queue so an event-scale plate count uses the same shopping and cook pipeline without mixing into customer orders.

## 5. End-to-end workflow

1. The customer builds a meal, sees aggregated nutrition, adds a kitchen note, and pays.
2. The commerce backend stores the lines and appends TSV. The kitchen email summarizes protein, side, and carb per meal.
3. A push locks the spool into deliver and archive. CABANA imports the batch into current orders.
4. MACRO checks the pool. Staff move orders Received → Cook → Package → Complete.
5. Kitchen demand aggregates the included lines, expands BOMs, nets sub-recipes against inventory, and builds shopping, prep, and cook output.
6. Stock and consume update inventory, with undo. Open calculators refresh from the same session.
7. Unit mismatches, missing grocer rows, stale inventory dates, and monthly-report warnings show where the model and the kitchen disagree. Dish Builder and the table editors are how those gaps get closed.

An order window on the storefront locks and unlocks checkout and labels the fulfillment week in Central time, so customers are not ordering into the wrong production cycle.

## 6. Decisions the system supports

- **Purchasing.** Package counts and a grand total come from shortages, not from a remembered list.
- **Scheduling.** MACRO rollups and cook-tree order follow what was actually ordered.
- **Menu price.** Rolled material cost and yield sit next to the decision to put a dish on the menu.
- **Catering.** Event batches reuse the weekly BOM engine.
- **Books.** Tax-sales rows and a monthly kitchen export can be compared, with an explicit warning when one side is absent.

## 7. Scope of the work

I designed the schemas, the APIs, the validation rules, and the operator workflows across both codebases, and deployed the storefront as a single host behind nginx.

The habits come from a decade as an integration engineer at Tavio (2013–2025): ETL, schema mapping, and reject-on-mismatch imports across HRIS and payroll systems. The mechanical engineering degree from Stony Brook (2012) shows up in yield scaling and unit consistency.

The same standard is the point of the sample in this repo. [`cabana/demo.mjs`](../cabana/demo.mjs) scales a nested recipe, applies a documented simmer factor to liquids only, refuses a unit mismatch, and prices the shortage in whole packages. The names, emails, and prices in that sample are fictional.
