/**
 * Portfolio sketch of CABANA kitchen demand.
 * Fictional tables only. Not the production staff application.
 *
 *   node cabana/demo.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIMMER_LOSS_RATE = 0.1;
const SIMMER_OUTPUT_BLOCK = 1;
const ACTIVE_STATUS = new Set(["", "Received", "Cook", "Package"]);
const LIQUID_UNITS = new Set([
  "cup",
  "cups",
  "tsp",
  "tbsp",
  "fl oz",
  "ml",
  "l",
  "qt",
  "gal",
  "pt",
]);
const WEIGHT_UNITS = new Set(["lb", "lbs", "oz", "ounce", "ounces", "lb:oz"]);

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "sample-data");

function norm(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function splitRow(line) {
  return line.split("\t").map((cell) => {
    let value = cell.trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/""/g, '"');
    }
    return value;
  });
}

function readTsv(name) {
  const text = readFileSync(join(dataDir, name), "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function unitsMatch(a, b) {
  const left = norm(a);
  const right = norm(b);
  if (left === right) return true;
  return WEIGHT_UNITS.has(left) && WEIGHT_UNITS.has(right);
}

function formatOz(ounces) {
  const pounds = Math.floor(ounces / 16);
  const rest = Math.round((ounces - pounds * 16) * 10) / 10;
  if (pounds <= 0) return `${rest} oz`;
  if (rest === 0) return `${pounds} lb`;
  return `${pounds} lb ${rest} oz`;
}

function formatQty(qty, unit) {
  const rounded = Math.round(qty * 1000) / 1000;
  const u = norm(unit);
  if (u === "lb:oz" || u === "oz" || u === "ounce" || u === "ounces") {
    const pretty = formatOz(qty);
    if (!pretty.includes("lb")) return pretty;
    return `${rounded} oz (${pretty})`;
  }
  return `${rounded} ${unit}`;
}

const metaRows = readTsv("META_Recipes.tsv");
const recipeLines = readTsv("RCP_MASTER.tsv");
const grocerRows = readTsv("FD_unitCost.tsv");
const inventoryRows = readTsv("Inventory.tsv");
const orders = readTsv("orders_current.tsv");

const metaByName = new Map(metaRows.map((row) => [norm(row.Recipe_Name), row]));
const linesByCode = new Map();
for (const line of recipeLines) {
  const bucket = linesByCode.get(line.Recipe_Code) ?? [];
  bucket.push(line);
  linesByCode.set(line.Recipe_Code, bucket);
}
const grocerByName = new Map(grocerRows.map((row) => [norm(row.Item_Name), row]));
const inventoryByName = new Map(inventoryRows.map((row) => [norm(row.Item_Name), row]));

const demand = new Map();
const included = [];
const excluded = [];
for (const order of orders) {
  const status = order.Status.trim();
  const entry = `${order.order_number} ${status || "pending"} × ${order.quantity}`;
  if (!ACTIVE_STATUS.has(status)) {
    excluded.push(entry);
    continue;
  }
  included.push(entry);
  const name = order.menu_item_name.trim();
  const qty = Number(order.quantity);
  demand.set(name, (demand.get(name) ?? 0) + (Number.isFinite(qty) ? qty : 0));
}

const leaves = new Map();
const gaps = [];

function addLeaf(name, unit, qty) {
  const key = `${norm(name)}|${norm(unit)}`;
  const current = leaves.get(key) ?? { name, unit, qty: 0 };
  current.qty += qty;
  leaves.set(key, current);
}

function explode(recipeName, outputQty, stack) {
  const key = norm(recipeName);
  if (stack.includes(key)) {
    gaps.push(`Cycle at ${recipeName}; stopped rather than looping.`);
    return;
  }
  const meta = metaByName.get(key);
  if (!meta) {
    gaps.push(`No recipe named “${recipeName}”.`);
    return;
  }
  const perUnit = Number(meta.per_unit);
  if (!(perUnit > 0)) {
    gaps.push(`Recipe “${recipeName}” has no positive yield.`);
    return;
  }
  const scale = outputQty / perUnit;
  const simmer =
    norm(meta.requires_simmer) === "y"
      ? 1 + SIMMER_LOSS_RATE * (outputQty / SIMMER_OUTPUT_BLOCK)
      : 1;
  stack.push(key);
  for (const line of linesByCode.get(meta.Recipe_Code) ?? []) {
    let qty = Number(line.qty) * scale;
    if (!Number.isFinite(qty)) continue;
    if (metaByName.has(norm(line.Ingredient))) {
      explode(line.Ingredient, qty, stack);
      continue;
    }
    if (simmer !== 1 && LIQUID_UNITS.has(norm(line.unit))) qty *= simmer;
    addLeaf(line.Ingredient, line.unit, qty);
  }
  stack.pop();
}

for (const [name, qty] of demand) explode(name, qty, []);

const lines = [];
let storeTotal = 0;
for (const leaf of leaves.values()) {
  const grocer = grocerByName.get(norm(leaf.name));
  const onHandRow = inventoryByName.get(norm(leaf.name));
  let onHand = 0;
  if (onHandRow) {
    if (!unitsMatch(onHandRow.Unit, leaf.unit)) {
      gaps.push(
        `Inventory unit for ${leaf.name} is ${onHandRow.Unit}; demand is ${leaf.unit}. On-hand was not applied.`
      );
    } else {
      onHand = Number(onHandRow.Qty_On_Hand) || 0;
    }
  }
  const shortage = Math.max(0, leaf.qty - onHand);
  let packages = 0;
  let dollars = 0;
  if (!grocer) {
    gaps.push(`No grocer row for ${leaf.name}.`);
  } else if (!unitsMatch(grocer.unit, leaf.unit)) {
    gaps.push(
      `Unit mismatch for ${leaf.name}: recipe uses ${leaf.unit}, grocer list uses ${grocer.unit}. No package price.`
    );
  } else {
    const packageSize = Number(grocer.per_unit);
    const packageCost = Number(grocer.cost_perunit);
    if (shortage > 0 && packageSize > 0) {
      packages = Math.ceil(shortage / packageSize - 1e-9);
      dollars = packages * packageCost;
      storeTotal += dollars;
    }
  }
  lines.push({ leaf, onHand, shortage, packages, dollars });
}

console.log("COPA CABANA — fictional kitchen demand\n");
console.log("Included");
for (const entry of included) console.log(`  ${entry}`);
console.log("Excluded");
for (const entry of excluded) console.log(`  ${entry}`);
console.log("\nPlates");
for (const [name, qty] of demand) console.log(`  ${name}  ${qty}`);
console.log("\nBill of materials");
for (const { leaf } of lines) console.log(`  ${leaf.name}  ${formatQty(leaf.qty, leaf.unit)}`);
console.log("\nShopping list");
for (const row of lines) {
  const price = row.packages > 0 ? `  $${row.dollars.toFixed(2)}` : "";
  console.log(
    `  ${row.leaf.name}  need ${formatQty(row.leaf.qty, row.leaf.unit)}  on hand ${row.onHand}  shortage ${Math.round(row.shortage * 1000) / 1000}  pkgs ${row.packages}${price}`
  );
}
console.log(`\nStore total  $${storeTotal.toFixed(2)}`);
console.log("\nGaps");
if (gaps.length === 0) console.log("  none");
for (const gap of gaps) console.log(`  ${gap}`);
