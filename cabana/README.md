# CABANA sample

A sketch of the kitchen rules on fictional data. The staff application — React workspaces, the Express API, fulfillment printing, catering, and the real tables — stays private.

Run it from the repository root:

```bash
node cabana/demo.mjs
```

## Tables

| File | Columns that matter here |
|------|--------------------------|
| `sample-data/META_Recipes.tsv` | Name, code, yield (`per_unit`), unit, `requires_simmer` |
| `sample-data/RCP_MASTER.tsv` | Ingredient, unit, quantity, parent recipe |
| `sample-data/FD_unitCost.tsv` | Grocer name, package size (`per_unit`), cost per package, unit |
| `sample-data/Inventory.tsv` | Name, quantity on hand, unit, package size |
| `sample-data/orders_current.tsv` | Status, a fictional customer, `menu_item_name`, quantity |

Headers match the production column order so the sample is the same shape as a real import. The rows are not.

The order file includes Jordan Lee, Sam Patel, and Riley Chen at `example.com`. They are not customers. Order `0990` is **Complete** and must drop out of demand. Orders `1001` (Received) and `1002` (Cook) stay in.

## Rules the sketch implements

These are the production rules, narrowed so one file can show them.

1. **Yield.** Scaled line quantity = recipe line quantity × (amount asked ÷ `per_unit`).
2. **Nesting.** If an ingredient name is itself a recipe, expand it. A cycle is reported and not followed forever.
3. **Simmer.** If `requires_simmer` is `Y`, liquid leaves of that recipe are multiplied by `1 + 0.10 × (output amount ÷ 1)`. Butter is weight, so the pan sauce does not evaporate the butter. The 10% loss and the block size of 1 are the demo settings. Production reads them from kitchen settings.
4. **Active demand.** Blank, Received, Cook, and Package count. Complete does not.
5. **Units.** A grocer row prices a leaf only when the units match, including the weight family `lb` / `oz` / `lb:oz`. `lb:oz` quantities are ounces. A mismatch is a gap. The sketch does not invent a conversion.
6. **Shopping.** Shortage = required − on hand, floored at zero. Store packages = shortage ÷ package size, rounded up. Store dollars = packages × cost per package.

Finished-sub-recipe netting, print layouts, the monthly report, and the catering queue are real CABANA behavior. They are described in the [case study](../docs/case-study.md). They are not in `demo.mjs`.

## What the sample menu is doing

Four plates of **Citrus Herb Chicken** (two active orders). Each plate uses chicken thigh, a quarter cup of **Pan Sauce**, one **Herb Rice**, and one lemon zest.

Pan Sauce yields 1 cup and is marked simmer. Its stock line is liquid, so the sketch grosses that stock up. Herb Rice is not marked simmer, so its stock is scaled and then left alone.

Lemon zest is entered as `each` on the recipe and as `lb:oz` on the grocer list. The run should name that gap and refuse a package price for it.
