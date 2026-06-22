# Migration From The Static Prototype

The current prototype stores records in the browser. The deployable app stores records in Postgres. Migration should happen in deliberate passes so existing prototype behavior does not get lost.

## Phase 1: Export

Add an export button to the prototype that downloads one JSON file containing the current local data. Include:

- Homestead settings
- Coops
- Birds
- Breeding lines
- Mating periods
- Incubations
- Hatch batches
- Feed catalog
- Feed logs
- Egg logs
- Weight logs
- Recommendations and To Do state, if still needed

## Phase 2: Import Preview

Build an importer in the deployable app that reads the JSON file and shows a preview:

- Number of records by type
- Missing required fields
- Duplicate active bands, compared case-insensitively
- Unknown coop or line references
- Feed records that need cup-weight assumptions

## Phase 3: Import

After preview, insert records in dependency order:

1. Homestead settings
2. Coops
3. Breeding lines
4. Hatch batches
5. Birds
6. Mating periods and hen groups
7. Incubations
8. Feed types and feed logs
9. Egg logs
10. Weight logs

## Phase 4: Verify

After import, compare dashboard totals between the prototype and deployable app:

- Active birds
- Birds by sex and status
- Coops
- Egg totals
- Fertility rate
- Hatch rate
- Feed cost
- Lifetime bird costs

## Notes

The database already enforces the active band rule: `Purple-3` and `purple-3` are treated as the same active band within one homestead.
