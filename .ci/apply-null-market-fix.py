from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly 1 match, found {count}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# Domain: preserve missing values as null instead of Number(null) -> 0.
replace_once(
    'public/core/domain.js',
    "export function profitPct(profit, cost) {\n  return Number(cost) > 0 ? (Number(profit) / Number(cost)) * 100 : 0;\n}\n\nexport function calculateHolding(holding, { today = null } = {}) {\n  const initialLots = Number(holding.initialLots ?? holding.currentLots ?? 0);\n  const currentLots = Number(holding.currentLots ?? 0);\n  const ipoPrice = Number.isFinite(Number(holding.ipoPrice)) && Number(holding.ipoPrice) > 0 ? Number(holding.ipoPrice) : null;\n  const currentPrice = Number.isFinite(Number(holding.currentPrice)) ? Number(holding.currentPrice) : null;\n  const previousClose = Number.isFinite(Number(holding.previousClose)) ? Number(holding.previousClose) : null;",
    "export function profitPct(profit, cost) {\n  return Number(cost) > 0 ? (Number(profit) / Number(cost)) * 100 : 0;\n}\n\nfunction nullableFiniteNumber(value) {\n  if (value == null || value === '') return null;\n  const number = Number(value);\n  return Number.isFinite(number) ? number : null;\n}\n\nexport function calculateHolding(holding, { today = null } = {}) {\n  const initialLots = Number(holding.initialLots ?? holding.currentLots ?? 0);\n  const currentLots = Number(holding.currentLots ?? 0);\n  const ipoPriceValue = nullableFiniteNumber(holding.ipoPrice);\n  const ipoPrice = ipoPriceValue != null && ipoPriceValue > 0 ? ipoPriceValue : null;\n  const currentPrice = nullableFiniteNumber(holding.currentPrice);\n  const previousClose = nullableFiniteNumber(holding.previousClose);",
)
replace_once(
    'public/core/domain.js',
    "    if (row.date >= start && Number.isFinite(Number(row.close))) close = Number(row.close);",
    "    const rowClose = nullableFiniteNumber(row.close);\n    if (row.date >= start && rowClose != null) close = rowClose;",
)

# Portfolio service: apply the same nullable-number boundary before calculations/history merge.
replace_once(
    'public/core/portfolio-service.js',
    "function positiveNumber(value) {\n  const n = Number(value);\n  return Number.isFinite(n) && n > 0 ? n : null;\n}\n",
    "function positiveNumber(value) {\n  const n = Number(value);\n  return Number.isFinite(n) && n > 0 ? n : null;\n}\n\nfunction nullableFiniteNumber(value) {\n  if (value == null || value === '') return null;\n  const number = Number(value);\n  return Number.isFinite(number) ? number : null;\n}\n",
)
replace_once(
    'public/core/portfolio-service.js',
    "  const byDate = new Map();\n  for (const row of baseRows) {\n    if (!row?.date || !Number.isFinite(Number(row.close))) continue;\n    byDate.set(row.date, { ...row, close:Number(row.close) });\n  }\n\n  const validRecentRows = recentRows\n    .filter(row => row?.date && Number.isFinite(Number(row.close)))\n    .map(row => ({ ...row, close:Number(row.close) }));",
    "  const byDate = new Map();\n  for (const row of baseRows) {\n    const close = nullableFiniteNumber(row?.close);\n    if (!row?.date || close == null) continue;\n    byDate.set(row.date, { ...row, close });\n  }\n\n  const validRecentRows = recentRows\n    .map(row => ({ row, close: nullableFiniteNumber(row?.close) }))\n    .filter(({ row, close }) => row?.date && close != null)\n    .map(({ row, close }) => ({ ...row, close }));",
)
replace_once(
    'public/core/portfolio-service.js',
    "  const exchangePreviousClose = Number.isFinite(Number(previousClose)) ? Number(previousClose) : null;",
    "  const exchangePreviousClose = nullableFiniteNumber(previousClose);",
)
replace_once(
    'public/core/portfolio-service.js',
    "    const quotePreviousClose = Number.isFinite(Number(quote.previousClose)) ? Number(quote.previousClose) : null;",
    "    const quotePreviousClose = nullableFiniteNumber(quote.previousClose);",
)
replace_once(
    'public/core/portfolio-service.js',
    "      currentPrice: Number.isFinite(Number(quote.current)) ? Number(quote.current) : null,",
    "      currentPrice: nullableFiniteNumber(quote.current),",
)

print('guarded null-market patch applied')
