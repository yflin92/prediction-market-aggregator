# CrossMarket

A prediction-market aggregator that unifies **Kalshi** and **Polymarket** into a
single normalized interface: it matches equivalent markets across the two
venues, compares executable prices and liquidity, and flags cross-venue price
divergences and arbitrage.

This is an implementation of the [CrossMarket PRD](./crossmarket-prd). The PRD
targets a native macOS app; this repository delivers the same product as a
runnable **TypeScript backend + React web frontend** so the canonical market
engine — the strategically important layer (PRD §44) — can be exercised and
tested on any platform. The venue-adapter and engine layers are UI-agnostic and
could back a native client later.

> **Data only.** CrossMarket reads public market data and never places orders or
> routes users around venue geographic restrictions (PRD §35). Direct trading is
> explicitly out of scope for this MVP (PRD §6).

## Architecture

```
Kalshi ─┐
        ├─► Venue Adapters ─► Canonical Market Engine ─┬─► Matching (heuristic/LLM)
Poly  ──┘   (normalize)      (candidate gen + group)   ├─► Pricing / Divergence
                                                       └─► Arbitrage detection
                                                              │
                                            Local Store ◄─────┘
                                                 │
                                            REST API ─► React three-pane UI
```

Mirrors the PRD §41 architecture concept. Adding a venue means implementing
`PredictionMarketVenue` (`backend/src/venues/PredictionMarketVenue.ts`, PRD §42),
not rewriting the app.

### Backend (`backend/`)

| Module | Responsibility | PRD |
|---|---|---|
| `venues/` | Kalshi & Polymarket adapters → normalized `VenueMarket` | §11, §12 |
| `matching/` | Candidate generation + heuristic / optional LLM classifier | §13, §14 |
| `canonical/` | Group venue markets into `CanonicalMarket`; verified pairings | §15, §41 |
| `pricing/` | Consensus, midpoint divergence, executable comparison, freshness | §16, §17, §27 |
| `arbitrage/` | Cross-venue arbitrage detection with safety gates | §18, §19 |
| `api/` | Express REST API + serialization | §10, §20–§24 |

### Frontend (`frontend/`)

React + Vite three-pane trader workstation (PRD §10): sidebar navigation,
sortable market table, and a detail pane with venue comparison, executable-price
explanation, arbitrage breakdown, matching assessment, and a side-by-side
resolution-rule diff (PRD §26). Global ⌘K search (§22), watchlist (§23),
keyboard navigation, price-format toggle (§12), and dark/light mode (§29).

## Running it

Two processes: the API and the web client.

```bash
# 1. Backend (polls venues, builds the canonical graph, serves the API)
cd backend
npm install
npm start            # http://localhost:8787  (npm run dev for watch mode)

# 2. Frontend (in a second terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api to :8787
```

Then open the frontend URL. The market feed refreshes every 60s by default.

### Optional: LLM matching

The market matcher is deterministic by default. To use Claude for pair
classification (PRD §14), set `ANTHROPIC_API_KEY` before starting the backend —
it is picked up automatically and shown as `matcher: llm` in the header. See
`backend/.env.example`.

## Design principles enforced in code

These PRD principles are load-bearing, not decorative:

- **Never imply equivalence when contracts differ** (§9.2). The heuristic
  classifier caps confidence and refuses `EXACT` whenever it detects a differing
  numeric threshold, year, or month between the two contracts.
- **False arbitrage ≈ zero** (§38). The `Guaranteed Arbitrage` label requires a
  `VERIFIED_EXACT` match **and** fresh data **and** executable liquidity **and**
  positive net edge (§19). Everything else is a *Potential pricing discrepancy*.
- **Executable prices > headline probabilities** (§9.1). The UI distinguishes
  midpoint divergence from the cheapest place to actually buy (§17).
- **Timestamps everywhere** (§27). Every quote carries `lastUpdatedAt`; stale
  data can never produce a guaranteed arbitrage label.

## Testing

```bash
cd backend && npm test        # matching, pricing, and arbitrage-safety tests
```

The tests focus on the correctness-critical intelligence: conservative matching,
divergence math, and the arbitrage safety gates.

## Status vs. PRD scope

Implemented (P0): venue ingestion, normalized schema, market matching, price
divergence, match confidence, arbitrage detection with contract-rule warnings,
market feed, search, categories, market detail, venue & order-book comparison,
resolution criteria, watchlist. Native-desktop specifics (Keychain, menu-bar
mode, native notifications) and Phase-2 trading (§31–§33) are out of scope here.
```
