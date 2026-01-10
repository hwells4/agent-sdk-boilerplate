---
status: pending
priority: p3
issue_id: "014"
tags: [code-review, simplification, data-integrity]
dependencies: []
---

# Remove Unused Schema Fields (e2bCost, previewText)

## Problem Statement

Two schema fields are defined but marked as TODO and never populated, creating data model noise and potentially confusing developers who query these fields expecting data.

## Findings

**File:** `convex/schema.ts`

### 1. e2bCost (line 50)
```typescript
e2bCost: v.optional(v.number()), // TODO: Implement E2B cost tracking
```
- Never populated (grep confirms no writes)
- Cost tracking already exists in TypeScript SDK (`cost-tracking.ts`)
- Would require syncing SDK cost data to Convex

### 2. previewText (line 77)
```typescript
previewText: v.optional(v.string()), // TODO: Implement artifact preview generation
```
- Never populated
- Feature not implemented
- Unclear use case

**Additional locations:**
- `convex/sandboxRuns.ts:31,97,374,397` - e2bCost in update args

## Proposed Solutions

### Option 1: Remove Fields (Recommended)
Delete the fields from schema and all references.

**Pros:**
- Cleaner schema
- No confusion about missing data
- Honest about what's implemented

**Cons:**
- Requires Convex schema migration
- Would need to re-add if implementing later

**Effort:** Small (10 minutes)
**Risk:** Low

### Option 2: Implement the Features
Actually populate the fields.

**Pros:**
- Features work as intended
- Uses existing schema

**Cons:**
- Significant implementation effort
- May not be needed

**Effort:** Large
**Risk:** Medium

### Option 3: Document as Reserved
Keep fields but add clear documentation.

**Pros:**
- No migration needed
- Future-proof

**Cons:**
- Still confusing
- Dead code smell

**Effort:** Small
**Risk:** Low

## Recommended Action

Option 1 - Remove the fields. If/when these features are needed, they can be properly designed and added.

## Technical Details

**Affected files:**
- `convex/schema.ts` (remove fields)
- `convex/sandboxRuns.ts` (remove e2bCost from args)
- `convex/artifacts.ts` (remove previewText if present in args)

**Requires:** `npx convex deploy` after schema change

**Acceptance Criteria:**
- [ ] Fields removed from schema
- [ ] No references to removed fields
- [ ] Schema migration successful
- [ ] TypeScript compiles

## Work Log

| Date | Action | Notes |
|------|--------|-------|
| 2026-01-10 | Created | Identified during multiple reviews |

## Resources

- Convex schema migration documentation
- `convex/schema.ts` - current schema
