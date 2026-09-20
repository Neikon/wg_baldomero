# AGENTS.md — wg_baldomero (P2P party game)

> Handoff: when resuming this project in a new conversation (e.g. inside the devcontainer), start here.

## What it is

Browser multiplayer party game, 100% static (GitHub Pages), no backend or database.
Flow: create room → share `#/sala/<id>` link → lobby (1–20 players) → Baldomero game (deception and deduction).
P2P via Trystero (`torrent`, public trackers, no accounts). Logical host-authoritative with host migration. UI in Spanish.

## Architecture docs

- **Spec (design + §11 impl status):** `docs/superpowers/specs/2026-09-04-wg-template-fiesta-design.md`
- **Base plan (historical):** `docs/superpowers/plans/2026-09-04-wg-template-fiesta-implementation.md`
- **This file** is just the index/handoff; see those docs for detail.

## Code map

- `src/App.svelte`, `src/main.ts` — entry + hash router (`#/` → Landing, `#/sala/<id>` → Room)
- `src/routes/{Landing,Room,Game}.svelte` — pages; `Room.svelte` holds all game-agnostic P2P logic (hello/requestState/stateSync/action/rename, 2s heartbeat, 1s host tick, `electNewHost`; single game, no selector) + signaling watchdog (`Señalización X/Y`, ghost-room host warning with 8s grace, capped x2 hard-reload of stuck guest) + optional TURN + exportable debug panel (`?debug=1`) with auto ICE check
- `src/components/{PlayerList,ShareLink,NameInput}.svelte` — lobby UI
- `src/lib/net/` — `types.ts` (`Msg`); `trysteroAdapter.ts` (`appId='wg_baldomero_v1_'+salaId`, `relayStatus()`); `transport.ts` (4 verified trackers, 5 STUN, e2e-only `?tracker=` override); `turn.ts` (optional TURN for mobile symmetric NAT); `debug.ts` (exportable log: copy/download); `iceCheck.ts` ("Probar mi red": P2P_OK/SOLO_TURN/NO_P2P verdict); adapter takes `?lagMs=&lossPct=` (e2e-only simulated slow mobile)
- `scripts/patch-trystero.js` (postinstall) — fixes the trystero 0.20.1 offer-pool leak (ghost rooms within minutes without it)
- `src/lib/stores/{roomStore,gameStore}.ts` — room/peers/joinOrder/isHost; `gameStore` applies `stateSync` only if newer version
- `src/lib/game/{types,registry}.ts` — `GameModule` contract, registry by `juegoId`; `baldomero/` is the game (clue/vote/guess rounds over mailbox cards; guide: `docs/NUEVO-JUEGO.md`)
- `src/lib/utils/{id,names}.ts` — `generateSalaId` (6 chars), `assignName` (`Jugador N`), `sanitizeName`
- `vite.config.ts` — `base=VITE_BASE || '/wg_baldomero/'`, `host:true, strictPort:true` (devcontainer)
- `.devcontainer/` (`typescript-node:22`; post-create apt-installs `gh`, runs `npm ci`), ports 5173/4173
- `.github/workflows/pages.yml` — build (`VITE_BASE=/wg_baldomero/`) + `deploy-pages@v4`
- `tests/unit/` (41) + `tests/e2e/` (11, incl. real P2P rooms 5/10/15/20, burst, half-slow; 3 of the 6 public trackers are dead, redundancy absorbs it)

## Commands (Node 22)

```bash
npm ci            # install (devcontainer postCreate already does it)
npm run dev       # http://localhost:5173
npm run test      # vitest run (41 tests)
npm run check     # svelte-check + tsc
npm run build     # dist/ for Pages
npm run test:e2e  # Playwright; E2E_P2P=1 makes the tracker case mandatory
```

## History (condensed)

- Derived from the fiesta P2P template era (base-plan tasks, roadmap 1–6, ghost-room hardening ported from `wg_hipster` — see `docs/2026-09-10-sala-fantasma-p2p.md`); then renamed to `wg_baldomero`, de-templated (`docs/NUEVO-REPO.md` deleted), P2P/storage namespaces switched to `wg_baldomero_*`.
- Live URL: `https://neikon.github.io/wg_baldomero/` (Pages via workflow on `main`).

## Environment

- Host: Bazzite (Fedora atomic), no local node. Editor: **Zed** (not VS Code); standard devcontainer.
- Project language: ES. Constraint: nothing to host/pay for.
- `gh` CLI installed and logged in (`Neikon`, `repo`+`workflow` scopes); prefer it for GitHub ops (PRs, issues, Pages runs, releases).

## Resuming

1. Review the local diff and `git log` before changing anything.
2. Re-run `check/test/build/test:e2e` if code changed.
3. Next: Baldomero game complete (plan: `docs/superpowers/plans/2026-09-20-baldomero-implementation.md`); new games per `docs/NUEVO-JUEGO.md`.

<mcp_instructions>
  <server name="codebase-memory-mcp">
    Graph first: search_graph for symbols, trace_path for relationships, get_code_snippet for source, query_graph for multi-hop, and get_architecture for overview. Use search_code/grep for literals or coverage gaps. Indexes auto-refresh. Check cited-path coverage; paginate.
  </server>
</mcp_instructions>
