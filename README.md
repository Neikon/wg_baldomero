# wg_baldomero — Juego de fiesta P2P

Juego de fiesta multijugador en navegador. **Sin servidor ni base de datos**, 100% estático en GitHub Pages (1–20 jugadores, turnos).

- **Stack:** Svelte + Vite + TypeScript + Trystero (WebRTC P2P via trackers públicos)
- **Flujo:** Crear sala → compartir enlace `#/sala/<id>` → lobby → juego
- **Demo incluida:** trivia configurable (punto de partida a reemplazar)
- **Host migration:** Si el anfitrión se va, el siguiente jugador toma el control sin perder estado

## Uso rápido

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ listo para GH Pages
npm run test     # vitest
```

## Cómo funciona sin servidor

Usa [Trystero](https://github.com/dmotz/trystero) (strategy `torrent`) que se conecta a trackers públicos gratuitos (`wss://tracker.openwebtorrent.com` etc.) como señalización temporal. **No creas cuenta ni hosteas nada** — tu código solo está en `dist/`. El `salaId` se usa como `appId` para que peers se encuentren.

Alternativa: cambiar `src/lib/net/trysteroAdapter.ts` por PeerJS si prefieres.

## Desarrollar el juego

Este repo es el juego en sí (derivado de la plantilla fiesta P2P, no una
plantilla). La demo actual es la trivia en `src/lib/game/trivia/`:
sustitúyela por el juego final siguiendo [`docs/NUEVO-JUEGO.md`](docs/NUEVO-JUEGO.md)
(contrato `GameModule`, reglas del reducer y tests).

## Pruebas

```bash
npm run check
npm run test
npm run build
npx playwright install --with-deps chromium  # solo la primera vez
npm run test:e2e
E2E_P2P=1 npm run test:e2e  # exige la prueba real de dos navegadores
```

La prueba P2P se salta si no logra alcanzar los trackers, salvo cuando `E2E_P2P=1`.

## Deploy a GitHub Pages

- El workflow `.github/workflows/pages.yml` hace build y deploy automático al pushear a `main`.
- Configura `Settings → Pages → Source: GitHub Actions`.
- `vite.config.ts` usa `VITE_BASE=/wg_baldomero/` (coincide con este repo).

## Estructura

```
src/lib/net/      # P2P (Trystero adapter, helpers)
src/lib/stores/   # roomStore, gameStore
src/lib/game/     # contrato + registry + trivia (demo a reemplazar)
src/routes/       # Landing, Room, Game
src/components/   # PlayerList, ShareLink, NameInput
```

## Límites

- 20 jugadores max (mesh P2P)
- Host autoritativo, mensajes JSON pequeños
- Sin persistencia (recargar pierde sala)

Licencia MIT — modifícalo libremente.
