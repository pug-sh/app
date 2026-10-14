---
paths:
  - "src/pages/routegen/insights/**"
  - "src/pages/routegen/dashboards/**"
  - "src/components/event-filters/**"
  - "src/hooks/use-event-filters.ts"
  - "src/hooks/use-filter-state.ts"
  - "src/hooks/use-filter-query-params.ts"
  - "src/hooks/use-global-filter-schema.ts"
---

# Insights: aggregations and filters

Granularity and time range rules apply on more pages than Insights, so they are in CLAUDE.md.

## Aggregations

Trends event rows support per-event aggregation selection: `Total events`, `Unique users`, `Avg per user`, `Sum`, `Average`, `Min`, `Max`.

- Aggregation is event-row scoped, not global.
- `Sum` / `Average` / `Min` / `Max` require an `aggregationProperty`.
- The aggregation-property picker must only show numeric properties (`INTEGER` / `FLOAT` from schema `valueType`).
- For non-numeric aggregations, clear/ignore `aggregationProperty`.
- Funnel and retention ignore per-event aggregation and should continue using total counts.
- Summary stats should adapt to aggregation type instead of always presenting totals.

## Filters & query semantics

- Global filters are grouped: `InsightQuerySpec.filter_groups` + `filter_groups_operator` (sent as `QueryRequest.spec`), and `SegmentUsersRequest.filter_groups` + `filter_groups_operator`.
- Global filter keys:
  - If no event kinds are selected, use the base/unscoped schema.
  - If event kinds are selected, show only property keys common to all selected kinds (intersection for auto/custom keys).
  - Keep profile keys available in global filters.
- Event-row filters are event-scoped (`kindFilter`) and should only show properties for that event kind.
- Value input UX:
  - Always allow free text for values (suggestions are optional, not required).
  - Multi-value operators (`in`, `not in`) support manual multi-entry via Enter/comma + Add. `contains` / `not contains` are single-value (substring match): the backend's `PropertyFilter` CEL constraints require a non-empty `value` and forbid `values` for them, so they are not list-arity.
  - Presence operators (`is set`, `is not set`) are no-value operators and should commit immediately.
