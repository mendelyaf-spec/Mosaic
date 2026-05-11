# Mosaic — project notes for Claude

## Phase 2 reminders (when porting the Mosaic engine into `lib/mosaicEngine.js`)

Two commitments made to the user that must land in this phase:

1. **Persist the response cache to localStorage.**
   The existing `responseCache` is an in-memory `Map`, so a page reload clears it
   and re-testing with the same Maya seed costs full price again. Wrap reads/writes
   so the cache mirrors to `localStorage` under a key like `mosaic.responseCache.v1`.
   Hydrate on engine import; write-through on every set. Keep entries keyed on the
   exact prompt string (plus model + tool config if those vary).

2. **Hard cap web searches at 3 per slot-fill.**
   Pass `max_uses: 3` (or whichever the current API parameter is) when configuring
   the `web_search` tool for each slot-fill call. Same cap on Excavate. This bounds
   a runaway session to ~$0.40 instead of letting one bad slot rack up 8+ searches.
   If the cap is hit and the slot still doesn't have enough material, surface that
   in the slot's return value rather than silently retrying.

Both belong in the engine extraction, not bolted on later.
