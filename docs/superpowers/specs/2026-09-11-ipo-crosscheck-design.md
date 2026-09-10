# IPO Cross-Check Design

## Goal
Prevent the IPO calendar from silently missing an offering when the primary Gedik calendar is incomplete or delayed.

## Design
Keep Gedik as the primary calendar source. Add an independent cross-check layer that can discover offerings absent from Gedik, preferring official sources where practical and using Ahlatcı as an additional independent fallback.

The calendar merge must preserve existing semantics: a successful empty Gedik response remains authoritative for Gedik itself, but no longer means the overall multi-source calendar is empty. Records from independent sources are normalized and deduplicated by ticker plus offering date/identity. When sources disagree, official/KAP data wins for dates and key offering facts; Gedik remains the preferred presentation source when there is no conflict. Source provenance is retained so disagreements can be surfaced rather than silently overwritten.

## Failure handling
A source failure is not treated as an empty source. Other sources continue to run. The calendar only reports a confirmed absence after every configured discovery source that is required for confirmation has completed successfully. Partial-source results may still be shown, with warnings recorded for failed sources.

## Testing
Add regression tests for: Gedik missing an IPO that the cross-check finds; deduplication when both sources contain the same IPO; source failure versus true empty results; precedence when official data conflicts with brokerage data; and Android/native allow-list coverage for all newly used hosts.
