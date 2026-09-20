# AGENTS.md — wg_template (plantilla fiesta P2P)

> Archivo de traspaso: si retomas este proyecto en una conversación nueva (p. ej. dentro del devcontainer), empieza aquí.

## Qué es

Plantilla de juegos de fiesta multijugador en navegador, 100 % estática (GitHub Pages), sin backend ni base de datos.
Flujo: crear sala → compartir enlace `#/sala/<id>` → lobby (1–20 jugadores) → trivia demo por turnos.
Red P2P con Trystero (`torrent`, trackers públicos, sin cuentas). Host-autoritativo lógico con migración de host. UI en español.

## Dónde está la arquitectura

- **Spec (diseño + §11 estado de implementación):** `docs/superpowers/specs/2026-09-04-wg-template-fiesta-design.md`
- **Plan base (histórico):** `docs/superpowers/plans/2026-09-04-wg-template-fiesta-implementation.md`
- **Este archivo** es solo el índice/handoff; consulta esos documentos para el detalle.

## Mapa de código

- `src/App.svelte`, `src/main.ts` — entrada + router hash (`#/` → Landing, `#/sala/<id>` → Room)
- `src/routes/{Landing,Room,Game}.svelte` — páginas; `Room.svelte` contiene la lógica P2P agnóstica al juego (hello/requestState/stateSync/action/rename, heartbeat 2 s, tick host 1 s, `electNewHost`; un solo juego, sin selector ni `?juego=`) + vigía de señalización (línea `Señalización X/Y`, aviso fantasma al host con recarga y gracia de 8 s, recarga dura topada x2 del invitado atascado) + TURN opcional + panel debug exportable con chequeo ICE automático
- `src/components/{PlayerList,ShareLink,NameInput}.svelte` — UI lobby
- `src/lib/net/{types,trysteroAdapter,room,transport,turn}.ts` — `Msg`, adapter Trystero (`appId='wg_template_v1_'+salaId`, 4 trackers verificados 2026-09-09, 5 STUN + TURN opcional vía `turn.ts` para NAT simétrica de datos móviles), `electNewHost`/`isRoomFull`, `relayStatus()` (sockets trackers); `debug.ts` (log exportable con `?debug=1`: red+protocolo, copiar/descargar); `iceCheck.ts` (botón Probar mi red: gathering local + veredicto P2P_OK/SOLO_TURN/NO_P2P); `scripts/patch-trystero.js` (postinstall) corrige la fuga del offer pool de trystero 0.20.1 (40 RTCPeerConnection fugadas por ciclo → sala fantasma a los minutos); hooks solo-e2e vía query del hash: `transport.trackerUrls()` acepta `?tracker=ws://…` (repetible) y el adapter `?lagMs=&lossPct=` (móvil lento simulado)
- `src/lib/stores/{roomStore,gameStore}.ts` — `roomStore` (sala/peers/joinOrder/isHost) + `gameStore` (aplica `stateSync` solo si versión mayor)
- `src/lib/game/{types,registry}.ts` — contrato `GameModule` y registry dinámico por `juegoId`
- `src/lib/game/trivia/` — demo a reemplazar (configurable: número, segundos y categoría); guía en `docs/NUEVO-JUEGO.md`, derivación en `docs/NUEVO-REPO.md`
- `src/lib/utils/{id,names}.ts` — `generateSalaId` (6 chars), `assignName` (`Jugador N`), `sanitizeName`
- `vite.config.ts` — `base=VITE_BASE || '/wg_template/'`, `server/preview` con `host:true, strictPort:true` (devcontainer)
- `.devcontainer/devcontainer.json` + `post-create.sh` — imagen `typescript-node:22` (trae node/npm/git, **no** `gh`; el script lo instala vía apt y luego corre `npm ci`), puertos 5173/4173
- `.github/workflows/pages.yml` — build (`VITE_BASE=/wg_template/`) + `deploy-pages@v4`
- `tests/unit/` — 41 tests (21 previos + transporte 5, turn 7, debug 4, iceCheck 4); `tests/e2e/` — 11 casos: 5 previos (P2P real con dos contextos) + `multijugador.spec.ts` (salas P2P reales 5/10/15/20 escalonado + 15 en ráfaga + 8 con mitad lenta + envejecido opt-in vía tracker local `bittorrent-tracker` devDep, con aserción `Señalización: 1/1`; `E2E_PUBLIC`/`E2E_AGE_MIN` bajo demanda; nota: 3 de los 6 trackers públicos fallan y la redundancia lo absorbe)

## Comandos (Node 22)

```bash
npm ci            # instalar (postCreate del devcontainer ya lo hace)
npm run dev       # http://localhost:5173
npm run test      # vitest run (41 tests)
npm run check     # svelte-check + tsc
npm run build     # dist/ para Pages
npm run test:e2e  # Playwright; E2E_P2P=1 hace obligatorio el caso de trackers
```

## Estado a 2026-09-04

- ✅ Tasks 1–9 del plan base hechas y publicadas en `Neikon/wg_template`.
- ✅ Pages habilitado (`build_type=workflow`), run `33898722403` en success. URL: `https://neikon.github.io/wg_template/`.
- ✅ Roadmap 1–5 implementado localmente: votación, guía, selector sincronizado,
  trivia configurable, limpieza entre salas y E2E de dos jugadores.
- ✅ Verificación local: `check` 0 errores · `test` 24/24 · `build` correcto ·
  `test:e2e` 6/6 (incluida conexión P2P real).
- ✅ Roadmap 1–5 cerrado y publicado (`94570b2` en `origin/main`).
- ✅ Punto 6: plantilla de un solo juego (fuera votación, selector y `?juego=`);
  guía `docs/NUEVO-REPO.md`; verificación `check` 0 errores · `test` 21/21 ·
  `build` correcto · `test:e2e` 5/5 (P2P real incluido).
- ✅ Sala fantasma P2P (portado de wg_hipster, ver
  `docs/2026-09-10-sala-fantasma-p2p.md`): poda a 4 trackers verificados,
  `relayStatus()` + línea `Señalización X/Y` con aviso al host, curación del
  invitado (recarga dura topada), parche postinstall de la fuga del offer
  pool de Trystero, e2e multijugador real.

## Entorno

- Host: Bazzite (Fedora atomic) sin node local; antes se usó toolbox `Fedora-gpu` (node 22) vía podman.
- Editor del usuario: **Zed** (no VS Code). El devcontainer es estándar; ábrelo con el soporte de contenedores de Zed.
- Idioma del proyecto: ES. Restricción: nada que hostear/pagar (Trystero usa trackers públicos).

## Al retomar

1. Revisa el diff local y `git log` antes de modificar nada.
2. Repite `check/test/build/test:e2e` si cambia código.
3. Siguiente: derivar repos de juego con `docs/NUEVO-REPO.md`.
