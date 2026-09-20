# Baldomero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the trivia demo with the playable Baldomero game (hidden-role deception/deduction for 3–8 players) in this P2P web app.

**Architecture:** New `GameModule` (`id='baldomero'`) following the existing trivia pattern: pure host-side `reducer` + synced state + Svelte view. All actions already execute only on the host (`Room.svelte handleAction` returns early for guests), so `Math.random` inside the reducer is single-source. Roles live in synced state with an honest-players tradeoff (see Constraints).

**Tech Stack:** Svelte 5 + TypeScript + Vitest + Playwright (existing; no new deps).

**Spec:** `docs/Portero-baldomero-el_reglas.pdf` (rules), `docs/Baldomero_timbres.pdf` (doorbell decode table — NOT transcribed, RNG replaces dice+table), `docs/Baldomero_buzones.pdf` (12 mailbox cards × 16 words — transcribed verbatim into Task 1). Contract guide: `docs/NUEVO-JUEGO.md`.

## Global Constraints

- Node 22. No backend, no new dependencies.
- UI strings in Spanish (project language is ES).
- `gameId` is exactly `'baldomero'` everywhere.
- Host-authoritative: every action is applied by `game.reducer` on the host only (`src/routes/Room.svelte:122-137` already enforces this); `ctx = { isHost: from === hostId, peerId: from }`.
- Every accepted transition returns a NEW object with `version: state.version + 1`; rejected actions return the SAME `state` reference (no broadcast).
- `tick` actions arrive every second from `startTimerAndHeartbeat`; the Baldomero reducer MUST ignore them (return `state`) — the game has no timer.
- 3–8 players per round (physical rules). Rooms hold 1–20; rounds start only with 3–8.
- Roles are visible in synced `fullState` (Trystero broadcasts to all; no 1:1 channel exists). ACCEPTED TRADEOFF: the UI renders only the viewer's own role; reading others' requires devtools. Never render another player's role or the secret chisme to a player who must not see it.
- Clue words: trim, 1–30 chars.

## Review Focus

- A player joins mid-round: they must become a spectator (in `marcador`, NOT in `jugadores`), and the round's auto-advance must still fire. Test pins it in Task 4.
- A player leaves mid-round: auto-advance can stall (same pre-existing behavior as trivia). Escape hatch is host-only `reiniciar` → lobby. Test pins `reiniciar` in Task 5.
- Baldomero's identity and the secret chisme travel in synced state; the UI must never leak them (spectator view, voter view, blind-guess view). Enforced by the rendering rules in Task 7 (verified in its manual-smoke step); cheating requires devtools by design.
- Self-votes and votes for non-players must be rejected. Test pins it in Task 4.
- Two consecutive rounds must never repeat the same chisme cell (physical rule: re-roll on repeated dice combo). Test pins it in Task 5.

---

### Task 0: Baseline — commit the in-flight rename work

**Files:**
- Modify: none (git state only)
- Test: none (baseline run)

**Interfaces:**
- Consumes: nothing
- Produces: clean tree + known-green baseline for all later tasks

- [ ] **Step 1: Review the uncommitted diff**

```bash
git status --short && git log --oneline -5 && git diff --stat
```

- [ ] **Step 2: Run the baseline**

```bash
npm run check && npm run test && npm run build
```

Expected: `svelte-check` 0 errors, 41/41 tests pass, build OK.

- [ ] **Step 3: Commit the rename work**

```bash
git add -A && git commit -m "chore: rename wg_template to wg_baldomero, de-template repo"
```

---

### Task 1: Mailbox data (`buzones.ts` + integrity test)

**Files:**
- Create: `src/lib/game/baldomero/buzones.ts`
- Test: `tests/unit/buzones.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `BUZONES: { nombre: string; palabras: string[] }[]` (12 cards, 16 words each, row-major: index = fila*4+col with filas 1º–4º and cols A–D, transcribed verbatim from `docs/Baldomero_buzones.pdf`). Note: Transporte contains COCHE twice (A1 and D3) — faithful to the printed card, keep it.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { BUZONES } from '../../src/lib/game/baldomero/buzones'

describe('buzones', () => {
  it('trae 12 tarjetas con 16 chismes no vacíos cada una', () => {
    expect(BUZONES).toHaveLength(12)
    for (const t of BUZONES) {
      expect(t.nombre.trim().length).toBeGreaterThan(0)
      expect(t.palabras).toHaveLength(16)
      for (const p of t.palabras) expect(p.trim().length).toBeGreaterThan(0)
    }
  })
  it('incluye las categorías del juego físico', () => {
    const nombres = BUZONES.map(t => t.nombre)
    expect(nombres).toEqual(['Herramientas','Hogar','Instrumentos','Oficina','Países','Películas','Política','Prendas','Salud','Superhéroes','Transporte','Vacaciones'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/buzones.test.ts`
Expected: FAIL with "Failed to resolve import" (file does not exist).

- [ ] **Step 3: Write the data file** (`src/lib/game/baldomero/buzones.ts`, exact content)

```ts
export interface BuzonTarjeta { nombre: string; palabras: string[] }

export const BUZONES: BuzonTarjeta[] = [
  { nombre: 'Herramientas', palabras: ['MARTILLO','LLAVE INGLESA','PALA','DESTORNILLADOR','PICO','SIERRA','TALADRO','TIJERAS','CÚTER','NIVEL','ALICATES','AGUJA','METRO','LAPICERO','TENAZAS','ESPÁTULA'] },
  { nombre: 'Hogar', palabras: ['COMIDA','REUNIÓN','PAPEL HIGIÉNICO','HORARIO','VACACIONES','CHARLA','TAREAS','JUEGOS DE MESA','FREGAR','HIJOS','COLEGIO','CUARTO','INTIMIDAD','PAGA','VISITA','CENA'] },
  { nombre: 'Instrumentos', palabras: ['FLAUTA','TAMBOR','ACORDEÓN','GUITARRA','BATERÍA','CASTAÑUELAS','PIANO','TUBA','SAXOFÓN','ARPA','BAJO','ARMÓNICA','TRIÁNGULO','CAMPANA','VIOLÍN','GAITA'] },
  { nombre: 'Oficina', palabras: ['JEFA','SECRETARIO','FIESTA','MATERIAL','TURNOS','PAPELEO','CLIENTE','UNIFORME','ORDENADOR','NUEVO','DESPIDO','CAFEÍNA','DESCANSO','ACCIONISTAS','PELOTA','ENCHUFE'] },
  { nombre: 'Países', palabras: ['REINO UNIDO','ESPAÑA','JAPÓN','BRASIL','FRANCIA','EEUU','ITALIA','AUSTRALIA','ALEMANIA','MÉXICO','INDIA','ISRAEL','CANADÁ','CHINA','RUSIA','EGIPTO'] },
  { nombre: 'Películas', palabras: ['MATRIX','ORIGEN','SEVEN','EL REY LEÓN','12 MONOS','CASABLANCA','EL CLUB DE LA LUCHA','LOS PÁJAROS','LOS VENGADORES','TITANIC','300','TORRENTE','AMELIE','DIRTY DANCING','CONAN EL BÁRBARO','SOLO EN CASA'] },
  { nombre: 'Política', palabras: ['ESCAÑO','LEY','CORRUPCIÓN','MITÍN','PRESIDENTE','VOTANTE','ELECCIONES','CANDIDATO','OBRAS','CAMPAÑA','COALICIÓN','OPOSICIÓN','MANIFESTACIÓN','CIUDADANOS','PROMESA','OFICIAL'] },
  { nombre: 'Prendas', palabras: ['GORRO','BAÑADOR','SUDADERA','TRAJE','FALDA','BUFANDA','CORBATA','CHANCLAS','CAPA','SOMBRERO','CINTURÓN','PIJAMA','LIGUERO','ZAPATOS','PAÑUELO','BRAGAS'] },
  { nombre: 'Salud', palabras: ['HOSPITAL','HIERRO','ACCIDENTE','CHEQUEO','EDAD','VITAMINAS','DIETA','CRECER','ALOPECIA','ENFERMEDAD','PRÓSTATA','HERENCIA','EMBARAZO','JUBILACIÓN','DEPORTE','OBESIDAD'] },
  { nombre: 'Superhéroes', palabras: ['SUPERMAN','BATMAN','SPIDERMAN','EL CASTIGADOR','CAPITÁN AMÉRICA','DR. EXTRAÑO','TORMENTA','LOBEZNO','EL COMEDIANTE','HULK','VIUDA NEGRA','JOHN CONSTANTINE','HELLBOY','SPAWN','JUEZ DREDD','HIT-GIRL'] },
  { nombre: 'Transporte', palabras: ['COCHE','SCOOTER','MOTO DE CARRERAS','HELICÓPTERO','NAVE ESPACIAL','CAZA DE COMBATE','BICICLETA','AVIÓN DE PASAJEROS','AUTOBÚS','TRANVÍA','GLOBO','COCHE','TREN','FURGONETA','MONOPATÍN','PATINES'] },
  { nombre: 'Vacaciones', palabras: ['BILLETES','VACUNA','ALOJAMIENTO','PLAYA','MONTAÑA','CRUCERO','VUELO','GUÍA','HOTEL','RESERVAR','TURISMO','CONDUCIR','RECUERDO','FOTOS','GASTRONOMÍA','MAPA'] }
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/buzones.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/baldomero/buzones.ts tests/unit/buzones.test.ts
git commit -m "feat: add Baldomero mailbox cards data"
```

---

### Task 2: Types + engine lobby/start (`types.ts`, `engine.ts` part 1)

**Files:**
- Create: `src/lib/game/baldomero/types.ts`
- Create: `src/lib/game/baldomero/engine.ts` (Task 2 adds: constants, `createInitialState`, `empezarRonda`, and reducer cases `playerJoined`, `elegirTarjeta`, `startGame`; later tasks append the other cases before `return state`)
- Test: `tests/unit/baldomero.test.ts` (grows across Tasks 2–5; Task 2 adds the lobby/start block)

**Interfaces:**
- Consumes: `BUZONES` from Task 1
- Produces: `BaldomeroState`, `BaldomeroAction`, `MIN_JUGADORES=3`, `MAX_JUGADORES=8`, `createInitialState(peers: {id:string}[])`, `reducer(state, action, ctx:{isHost:boolean,peerId:string})`

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/baldomero.test.ts`)

```ts
import { describe, expect, it } from 'vitest'
import { createInitialState, reducer, MIN_JUGADORES, MAX_JUGADORES } from '../../src/lib/game/baldomero/engine'
import type { BaldomeroState } from '../../src/lib/game/baldomero/types'

const ctxHost = { isHost: true, peerId: 'h1' }
const peers4 = [{id:'h1'},{id:'p2'},{id:'p3'},{id:'p4'}]

describe('baldomero lobby/start', () => {
  it('estado inicial en lobby con marcador a cero', () => {
    const s = createInitialState(peers4)
    expect(s.phase).toBe('lobby')
    expect(s.version).toBe(0)
    expect(s.gameId).toBe('baldomero')
    expect(s.marcador).toEqual({ h1:0, p2:0, p3:0, p4:0 })
  })
  it('no empieza con menos de 3 jugadores', () => {
    const s = createInitialState([{id:'h1'},{id:'p2'}])
    expect(reducer(s, { t:'startGame' }, ctxHost)).toBe(s)
  })
  it('el host reparte roles y chisme al empezar', () => {
    const s = createInitialState(peers4)
    const n = reducer(s, { t:'startGame' }, ctxHost)
    expect(n.phase).toBe('pistas')
    expect(n.jugadores).toEqual(['h1','p2','p3','p4'])
    expect(n.jugadores).toContain(n.baldomeroId)
    expect(n.chisme).toBeGreaterThanOrEqual(0)
    expect(n.chisme).toBeLessThanOrEqual(15)
    expect(n.version).toBe(1)
  })
  it('un invitado no puede empezar ni elegir tarjeta', () => {
    const s = createInitialState(peers4)
    expect(reducer(s, { t:'startGame' }, { isHost:false, peerId:'p2' })).toBe(s)
    expect(reducer(s, { t:'elegirTarjeta', tarjeta: 5 }, { isHost:false, peerId:'p2' })).toBe(s)
  })
  it('elegirTarjeta valida el rango', () => {
    const s = createInitialState(peers4)
    expect(reducer(s, { t:'elegirTarjeta', tarjeta: 5 }, ctxHost).tarjeta).toBe(5)
    expect(reducer(s, { t:'elegirTarjeta', tarjeta: 99 }, ctxHost)).toBe(s)
  })
  it('playerJoined añade al marcador', () => {
    const s = createInitialState(peers4)
    const n = reducer(s, { t:'playerJoined', peerId:'p5' }, ctxHost)
    expect(n.marcador.p5).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/baldomero.test.ts`
Expected: FAIL with "Failed to resolve import" (engine does not exist).

- [ ] **Step 3: Write `src/lib/game/baldomero/types.ts`** (exact content)

```ts
export type BaldomeroPhase = 'lobby' | 'pistas' | 'votacion' | 'adivinanza' | 'final'

export interface BaldomeroState {
  phase: BaldomeroPhase
  version: number
  gameId: 'baldomero'
  tarjeta: number       // índice en BUZONES (0-11)
  ronda: number
  baldomeroId: string   // SECRETO: visible en el estado; la UI solo muestra el rol propio
  chisme: number        // SECRETO salvo vecinos: índice de celda 0-15
  ultimaCelda: number   // chisme de la ronda anterior (no repetir)
  jugadores: string[]   // peerIds de esta ronda (foto fija al empezar)
  pistas: Record<string, string>
  votos: Record<string, string>
  descubiertos: string[] // más votados
  intentos: number       // intentos restantes de Baldomero en adivinanza
  adivinanza: number | null
  aCiegas: boolean       // 7-8 jugadores: adivinar sin ver la tarjeta
  ganador: 'baldomero' | 'vecinos' | null
  marcador: Record<string, number> // rondas ganadas
}

export type BaldomeroAction =
  | { t: 'startGame'; config?: { tarjeta?: number } }
  | { t: 'elegirTarjeta'; tarjeta: number }
  | { t: 'darPista'; palabra: string }
  | { t: 'votar'; objetivo: string }
  | { t: 'adivinar'; celda: number }
  | { t: 'nuevaRonda' }
  | { t: 'reiniciar' }
  | { t: 'playerJoined'; peerId: string }
```

- [ ] **Step 4: Write `src/lib/game/baldomero/engine.ts` part 1** (exact content; Tasks 3–5 insert cases before the final `return state`)

```ts
import type { BaldomeroState, BaldomeroAction } from './types'
import { BUZONES } from './buzones'

export const MIN_JUGADORES = 3
export const MAX_JUGADORES = 8

function pickBaldomero(ids: string[]): string {
  return ids[Math.floor(Math.random() * ids.length)]
}

function pickCelda(evitar: number): number {
  let c = Math.floor(Math.random() * 16)
  while (c === evitar) c = Math.floor(Math.random() * 16)
  return c
}

export function createInitialState(peers: { id: string }[]): BaldomeroState {
  const marcador: Record<string, number> = {}
  for (const p of peers) marcador[p.id] = 0
  return {
    phase: 'lobby', version: 0, gameId: 'baldomero',
    tarjeta: 0, ronda: 0, baldomeroId: '', chisme: -1, ultimaCelda: -1,
    jugadores: [], pistas: {}, votos: {}, descubiertos: [],
    intentos: 0, adivinanza: null, aCiegas: false,
    ganador: null, marcador
  }
}

function empezarRonda(state: BaldomeroState, tarjeta: number): BaldomeroState {
  const jugadores = Object.keys(state.marcador)
  return {
    ...state, phase: 'pistas', tarjeta,
    ronda: state.ronda + 1,
    baldomeroId: pickBaldomero(jugadores),
    chisme: pickCelda(state.chisme),
    ultimaCelda: state.chisme,
    jugadores, pistas: {}, votos: {}, descubiertos: [],
    intentos: 0, adivinanza: null, aCiegas: false,
    ganador: null, version: state.version + 1
  }
}

export function reducer(state: BaldomeroState, action: BaldomeroAction, ctx: { isHost: boolean; peerId: string }): BaldomeroState {
  if (action.t === 'playerJoined') {
    if (!ctx.isHost || state.marcador[action.peerId] !== undefined) return state
    return { ...state, marcador: { ...state.marcador, [action.peerId]: 0 }, version: state.version + 1 }
  }
  if (action.t === 'elegirTarjeta') {
    if (!ctx.isHost || state.phase !== 'lobby') return state
    const t = action.tarjeta
    if (!Number.isInteger(t) || t < 0 || t >= BUZONES.length) return state
    return { ...state, tarjeta: t, version: state.version + 1 }
  }
  if (action.t === 'startGame') {
    if (!ctx.isHost) return state
    if (state.phase !== 'lobby' && state.phase !== 'final') return state
    const n = Object.keys(state.marcador).length
    if (n < MIN_JUGADORES || n > MAX_JUGADORES) return state
    let tarjeta = state.tarjeta
    const cfg = (action as { config?: { tarjeta?: number } }).config?.tarjeta
    if (Number.isInteger(cfg) && (cfg as number) >= 0 && (cfg as number) < BUZONES.length) tarjeta = cfg as number
    return empezarRonda(state, tarjeta)
  }
  return state
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/baldomero.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/baldomero/types.ts src/lib/game/baldomero/engine.ts tests/unit/baldomero.test.ts
git commit -m "feat: add Baldomero types and lobby/start engine"
```

---

### Task 3: Engine pistas (`darPista` + auto-avance)

**Files:**
- Modify: `src/lib/game/baldomero/engine.ts` (insert the `darPista` case before the final `return state`)
- Test: `tests/unit/baldomero.test.ts` (append the pistas block)

**Interfaces:**
- Consumes: `BaldomeroState`, `reducer` from Task 2
- Produces: `darPista` case: validates phase/pista, trims to 1–30 chars, one pista per player, advances to `votacion` when every `jugadores` entry submitted

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/baldomero.test.ts`)

```ts
describe('baldomero pistas', () => {
  function ronda4(): BaldomeroState {
    return reducer(createInitialState(peers4), { t:'startGame' }, ctxHost)
  }
  it('rechaza pistas vacías, duplicadas y de no jugadores', () => {
    const s = ronda4()
    expect(reducer(s, { t:'darPista', palabra:'   ' }, { isHost:false, peerId:'p2' })).toBe(s)
    const una = reducer(s, { t:'darPista', palabra:'  cuchara ' }, { isHost:false, peerId:'p2' })
    expect(una.pistas.p2).toBe('cuchara')
    expect(reducer(una, { t:'darPista', palabra:'otra' }, { isHost:false, peerId:'p2' })).toBe(una)
    expect(reducer(s, { t:'darPista', palabra:'x' }, { isHost:false, peerId:'nadie' })).toBe(s)
  })
  it('avanza a votacion cuando todos dan su pista', () => {
    let s = ronda4()
    for (const pid of ['h1','p2','p3','p4']) {
      s = reducer(s, { t:'darPista', palabra:'w-'+pid }, { isHost: pid==='h1', peerId: pid })
    }
    expect(s.phase).toBe('votacion')
  })
  it('un playerJoined a mitad de ronda no bloquea el avance (espectador)', () => {
    let s = ronda4()
    s = reducer(s, { t:'playerJoined', peerId:'p5' }, ctxHost)
    expect(s.jugadores).toEqual(['h1','p2','p3','p4'])
    for (const pid of ['h1','p2','p3','p4']) {
      s = reducer(s, { t:'darPista', palabra:'w' }, { isHost: pid==='h1', peerId: pid })
    }
    expect(s.phase).toBe('votacion')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/baldomero.test.ts`
Expected: FAIL — `darPista` returns `state` unchanged (`pistas.p2` undefined, phase stays `pistas`).

- [ ] **Step 3: Implement the `darPista` case** (insert in `engine.ts` before the final `return state`)

```ts
  if (action.t === 'darPista') {
    if (state.phase !== 'pistas') return state
    if (!state.jugadores.includes(ctx.peerId)) return state
    if (state.pistas[ctx.peerId] !== undefined) return state
    const palabra = (action.palabra ?? '').trim().slice(0, 30)
    if (!palabra) return state
    const pistas = { ...state.pistas, [ctx.peerId]: palabra }
    const next: BaldomeroState = { ...state, pistas, version: state.version + 1 }
    if (state.jugadores.every(id => pistas[id] !== undefined)) {
      return { ...next, phase: 'votacion', version: next.version + 1 }
    }
    return next
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/baldomero.test.ts`
Expected: PASS (6 + 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/baldomero/engine.ts tests/unit/baldomero.test.ts
git commit -m "feat: add Baldomero clue phase"
```

---

### Task 4: Engine votación (`votar` + resolución)

**Files:**
- Modify: `src/lib/game/baldomero/engine.ts` (insert the `votar` case before the final `return state`)
- Test: `tests/unit/baldomero.test.ts` (append the votación block)

**Interfaces:**
- Consumes: `reducer`, votacion phase from Task 3
- Produces: `votar` case: one vote per player, no self-votes, targets must be round players; on all-voted computes the top-voted set — Baldomero outside it wins at once (`final`, `ganador='baldomero'`), otherwise `adivinanza` with `intentos` (2 with 3 players, else 1) and `aCiegas` (7+ players)

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/baldomero.test.ts`)

```ts
describe('baldomero votacion', () => {
  function enVotacion(): BaldomeroState {
    let s = reducer(createInitialState(peers4), { t:'startGame' }, ctxHost)
    for (const pid of ['h1','p2','p3','p4']) {
      s = reducer(s, { t:'darPista', palabra:'w' }, { isHost: pid==='h1', peerId: pid })
    }
    return s
  }
  function vecinoDe(s: BaldomeroState): string {
    return s.jugadores.find(id => id !== s.baldomeroId)!
  }
  it('rechaza autovoto, voto a no jugador y voto doble', () => {
    const s = enVotacion()
    expect(reducer(s, { t:'votar', objetivo:'p3' }, { isHost:false, peerId:'p3' })).toBe(s)
    expect(reducer(s, { t:'votar', objetivo:'nadie' }, { isHost:false, peerId:'p2' })).toBe(s)
    const uno = reducer(s, { t:'votar', objetivo:'p3' }, { isHost:false, peerId:'p2' })
    expect(reducer(uno, { t:'votar', objetivo:'p4' }, { isHost:false, peerId:'p2' })).toBe(uno)
  })
  it('si Baldomero no es el más votado gana al instante', () => {
    let s = enVotacion()
    const v = vecinoDe(s)
    const otro = s.jugadores.find(id => id !== v)!
    for (const pid of s.jugadores) {
      const objetivo = pid === v ? otro : v // el objetivo vota a otro (el autovoto está prohibido)
      s = reducer(s, { t:'votar', objetivo }, { isHost: pid==='h1', peerId: pid })
    }
    expect(s.phase).toBe('final')
    expect(s.ganador).toBe('baldomero')
    expect(s.marcador[s.baldomeroId]).toBe(1)
  })
  it('si lo descubren hay adivinanza con 1 intento (2 con 3 jugadores)', () => {
    let s = enVotacion()
    const w = s.jugadores.find(id => id !== s.baldomeroId)!
    for (const pid of s.jugadores) {
      const objetivo = pid === s.baldomeroId ? w : s.baldomeroId // Baldomero no puede votarse a sí mismo
      s = reducer(s, { t:'votar', objetivo }, { isHost: pid==='h1', peerId: pid })
    }
    expect(s.phase).toBe('adivinanza')
    expect(s.descubiertos).toEqual([s.baldomeroId])
    expect(s.intentos).toBe(1)
    expect(s.aCiegas).toBe(false)
    let t = reducer(createInitialState([{id:'h1'},{id:'p2'},{id:'p3'}]), { t:'startGame' }, ctxHost)
    for (const pid of ['h1','p2'] as const) t = reducer(t, { t:'darPista', palabra:'w' }, { isHost: pid==='h1', peerId: pid })
    t = reducer(t, { t:'darPista', palabra:'w' }, { isHost:false, peerId:'p3' })
    for (const pid of ['h1','p2','p3'] as const) {
      const objetivo = pid === t.baldomeroId ? (['h1','p2','p3'] as const).find(id => id !== t.baldomeroId)! : t.baldomeroId
      t = reducer(t, { t:'votar', objetivo }, { isHost: pid==='h1', peerId: pid })
    }
    expect(t.phase).toBe('adivinanza')
    expect(t.intentos).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/baldomero.test.ts`
Expected: FAIL — `votar` returns `state` unchanged (phase stays `votacion`).

- [ ] **Step 3: Implement the `votar` case** (insert in `engine.ts` before the final `return state`)

```ts
  if (action.t === 'votar') {
    if (state.phase !== 'votacion') return state
    if (!state.jugadores.includes(ctx.peerId)) return state
    if (state.votos[ctx.peerId] !== undefined) return state
    const objetivo = action.objetivo
    if (objetivo === ctx.peerId || !state.jugadores.includes(objetivo)) return state
    const votos = { ...state.votos, [ctx.peerId]: objetivo }
    const next: BaldomeroState = { ...state, votos, version: state.version + 1 }
    if (!state.jugadores.every(id => votos[id] !== undefined)) return next
    const cuenta: Record<string, number> = {}
    for (const v of Object.values(votos)) cuenta[v] = (cuenta[v] ?? 0) + 1
    const max = Math.max(...Object.values(cuenta))
    const descubiertos = Object.keys(cuenta).filter(id => cuenta[id] === max)
    if (!descubiertos.includes(state.baldomeroId)) {
      const marcador = { ...state.marcador }
      marcador[state.baldomeroId] = (marcador[state.baldomeroId] ?? 0) + 1
      return { ...next, phase: 'final', descubiertos, ganador: 'baldomero', marcador, version: next.version + 1 }
    }
    return {
      ...next, phase: 'adivinanza', descubiertos,
      intentos: state.jugadores.length === MIN_JUGADORES ? 2 : 1,
      aCiegas: state.jugadores.length >= 7,
      version: next.version + 1
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/baldomero.test.ts`
Expected: PASS (9 + 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/baldomero/engine.ts tests/unit/baldomero.test.ts
git commit -m "feat: add Baldomero voting and resolution"
```

---

### Task 5: Engine adivinanza/final (`adivinar`, `nuevaRonda`, `reiniciar`)

**Files:**
- Modify: `src/lib/game/baldomero/engine.ts` (insert the three cases before the final `return state`)
- Test: `tests/unit/baldomero.test.ts` (append the final block incl. a full-round integration test)

**Interfaces:**
- Consumes: `reducer`, adivinanza phase from Task 4
- Produces: `adivinar` (only Baldomero, cell 0–15; correct = Baldomero wins, wrong = decrements, exhausted = neighbors win and score), `nuevaRonda` (host, new Baldomero + new cell ≠ previous), `reiniciar` (host, back to lobby keeping `marcador`/`tarjeta`)

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/baldomero.test.ts`)

```ts
describe('baldomero adivinanza y final', () => {
  function enAdivinanza(n = 4): { s: BaldomeroState; ids: string[] } {
    const ids = Array.from({ length: n }, (_, i) => (i === 0 ? 'h1' : 'p' + (i + 1)))
    let s = reducer(createInitialState(ids.map(id => ({ id }))), { t:'startGame' }, ctxHost)
    for (const pid of ids) s = reducer(s, { t:'darPista', palabra:'w' }, { isHost: pid==='h1', peerId: pid })
    const w = s.jugadores.find(id => id !== s.baldomeroId)!
    for (const pid of ids) {
      const objetivo = pid === s.baldomeroId ? w : s.baldomeroId // sin autovoto (ruling Task 4)
      s = reducer(s, { t:'votar', objetivo }, { isHost: pid==='h1', peerId: pid })
    }
    return { s, ids }
  }
  it('solo Baldomero puede adivinar y la celda debe ser válida', () => {
    const { s } = enAdivinanza()
    expect(reducer(s, { t:'adivinar', celda: s.chisme }, { isHost:false, peerId: s.jugadores.find(id => id !== s.baldomeroId)! })).toBe(s)
    expect(reducer(s, { t:'adivinar', celda: 99 }, { isHost: s.baldomeroId==='h1', peerId: s.baldomeroId })).toBe(s)
  })
  it('acierto = gana Baldomero; fallo con intentos agotados = ganan vecinos y puntúan', () => {
    const { s } = enAdivinanza()
    const bctx = { isHost: s.baldomeroId==='h1', peerId: s.baldomeroId }
    const win = reducer(s, { t:'adivinar', celda: s.chisme }, bctx)
    expect(win.phase).toBe('final')
    expect(win.ganador).toBe('baldomero')
    const mal = (s.chisme + 1) % 16
    const lose = reducer(s, { t:'adivinar', celda: mal }, bctx)
    expect(lose.phase).toBe('final')
    expect(lose.ganador).toBe('vecinos')
    for (const id of s.jugadores) {
      expect(lose.marcador[id]).toBe(id === s.baldomeroId ? 0 : 1)
    }
  })
  it('nuevaRonda cambia chisme y reiniciar vuelve al lobby', () => {
    const { s } = enAdivinanza()
    const bctx = { isHost: s.baldomeroId==='h1', peerId: s.baldomeroId }
    const fin = reducer(s, { t:'adivinar', celda: s.chisme }, bctx)
    const r2 = reducer(fin, { t:'nuevaRonda' }, ctxHost)
    expect(r2.phase).toBe('pistas')
    expect(r2.ronda).toBe(2)
    expect(r2.chisme).not.toBe(s.chisme)
    expect(r2.pistas).toEqual({})
    const lob = reducer(r2, { t:'reiniciar' }, ctxHost)
    expect(lob.phase).toBe('lobby')
    expect(lob.marcador).toEqual(fin.marcador)
  })
  it('ronda completa de 4 jugadores de principio a fin', () => {
    let s = reducer(createInitialState(peers4), { t:'startGame' }, ctxHost)
    expect(s.phase).toBe('pistas')
    for (const pid of peers4.map(p => p.id)) {
      s = reducer(s, { t:'darPista', palabra: 'pista-' + pid }, { isHost: pid==='h1', peerId: pid })
    }
    expect(s.phase).toBe('votacion')
    for (const pid of peers4.map(p => p.id)) {
      const objetivo = pid === s.baldomeroId ? peers4.map(p => p.id).find(id => id !== s.baldomeroId)! : s.baldomeroId
      s = reducer(s, { t:'votar', objetivo }, { isHost: pid==='h1', peerId: pid })
    }
    expect(s.phase).toBe('adivinanza')
    s = reducer(s, { t:'adivinar', celda: (s.chisme + 3) % 16 }, { isHost: s.baldomeroId==='h1', peerId: s.baldomeroId })
    expect(s.phase).toBe('final')
    expect(s.ganador).toBe('vecinos')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/baldomero.test.ts`
Expected: FAIL — unknown actions return `state` unchanged (phase stays `adivinanza`).

- [ ] **Step 3: Implement the three cases** (insert in `engine.ts` before the final `return state`)

```ts
  if (action.t === 'adivinar') {
    if (state.phase !== 'adivinanza') return state
    if (ctx.peerId !== state.baldomeroId) return state
    const celda = action.celda
    if (!Number.isInteger(celda) || celda < 0 || celda > 15) return state
    if (celda === state.chisme) {
      const marcador = { ...state.marcador }
      marcador[state.baldomeroId] = (marcador[state.baldomeroId] ?? 0) + 1
      return { ...state, phase: 'final', adivinanza: celda, ganador: 'baldomero', marcador, version: state.version + 1 }
    }
    const intentos = state.intentos - 1
    if (intentos > 0) {
      return { ...state, adivinanza: celda, intentos, version: state.version + 1 }
    }
    const marcador = { ...state.marcador }
    for (const id of state.jugadores) {
      if (id !== state.baldomeroId) marcador[id] = (marcador[id] ?? 0) + 1
    }
    return { ...state, phase: 'final', adivinanza: celda, intentos: 0, ganador: 'vecinos', marcador, version: state.version + 1 }
  }
  if (action.t === 'nuevaRonda') {
    if (!ctx.isHost) return state
    if (state.phase !== 'final') return state
    return empezarRonda(state, state.tarjeta)
  }
  if (action.t === 'reiniciar') {
    if (!ctx.isHost) return state
    if (state.phase === 'lobby') return state
    const fresh = createInitialState([])
    return {
      ...fresh, phase: 'lobby', version: state.version + 1,
      tarjeta: state.tarjeta, marcador: state.marcador,
      ultimaCelda: state.chisme, ronda: state.ronda
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/baldomero.test.ts`
Expected: PASS (12 + 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/baldomero/engine.ts tests/unit/baldomero.test.ts
git commit -m "feat: add Baldomero guess, scoring and round reset"
```

---

### Task 6: Registry switch + delete trivia

**Files:**
- Modify: `src/lib/game/registry.ts` (register `baldomero`, `DEFAULT_GAME_ID='baldomero'`)
- Modify: `src/lib/stores/gameStore.ts:9` (initial `{ phase:'lobby', version:0, gameId:'baldomero' }`)
- Delete: `src/lib/game/trivia/` (`engine.ts`, `types.ts`, `questions.ts`, `Trivia.svelte`), `tests/unit/engine.test.ts`
- Modify: `tests/unit/registry.test.ts` (expect `'baldomero'`)

**Interfaces:**
- Consumes: `baldomeroEngine.createInitialState/reducer` + `BaldomeroComp` (Task 8 file must exist before this task's verification passes; if working task-by-task, create the stub component first — see Step 3)
- Produces: `DEFAULT_GAME_ID='baldomero'`; `Room.svelte` picks it up with zero shell changes (`let juegoId = DEFAULT_GAME_ID`, `createInitialState(initPeers)`)

- [ ] **Step 1: Update the failing test** (`tests/unit/registry.test.ts`, exact content)

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_GAME_ID, getGameModule } from '../../src/lib/game/registry'

describe('game registry', () => {
  it('resuelve el juego registrado y rechaza ids desconocidos', () => {
    expect(DEFAULT_GAME_ID).toBe('baldomero')
    expect(getGameModule('baldomero')?.id).toBe('baldomero')
    expect(getGameModule('desconocido')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/registry.test.ts tests/unit/baldomero.test.ts tests/unit/buzones.test.ts`
Expected: FAIL — registry still resolves `trivia`.

- [ ] **Step 3: Write the new registry** (`src/lib/game/registry.ts`, exact content; the `Baldomero.svelte` import requires Task 8's component to exist — create it as an empty stub `<script lang="ts">export let onAction: (a:any)=>void = ()=>{}</script>` if Task 8 is not done yet, then flesh it out there)

```ts
import * as baldomeroEngine from './baldomero/engine'
import BaldomeroComp from './baldomero/Baldomero.svelte'
import type { GameModule } from './types'

export const DEFAULT_GAME_ID = 'baldomero'

export const registry: Record<string, GameModule<any, any> & { Component: any }> = {
  baldomero: {
    id: 'baldomero',
    nombre: 'Baldomero',
    createInitialState: baldomeroEngine.createInitialState,
    reducer: baldomeroEngine.reducer,
    Component: BaldomeroComp
  }
}

export function getGameModule(id: string) {
  return registry[id] ?? null
}
```

- [ ] **Step 4: Switch the store default + delete trivia**

```bash
# gameStore.ts:9 → gameId:'baldomero'
rm -rf src/lib/game/trivia tests/unit/engine.test.ts
npx vitest run tests/unit/registry.test.ts
```

Expected: PASS. Full `npm run test` still shows failures only from e2e-referenced trivia UI (fixed in Task 9) — unit suite itself must be green except deleted `engine.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: switch default game to Baldomero, remove trivia"
```

---

### Task 7: `Baldomero.svelte` view (all phases)

**Files:**
- Create: `src/lib/game/baldomero/Baldomero.svelte`
- Test: manual + Task 9 e2e (no unit test for Svelte rendering in this repo)

**Interfaces:**
- Consumes: `gameStore`, `roomStore`, `BUZONES`, `BaldomeroState`; sends actions via `onAction` prop (same contract as the deleted `Trivia.svelte:8`: `export let onAction: (a:any)=>void`). `startGame` needs no `juegoId` — `Room.svelte handleGameAction` injects it.
- Produces: rendered game for every phase. EXACT interactive strings (e2e in Task 9 depends on them — do not reword):
  - lobby host: select labelled `Tarjeta de buzones`, button `Empezar partida`, hint `Necesitas entre 3 y 8 vecinos en la sala (ahora: N).` when roster out of range
  - pistas: input labelled `Tu pista`, button `Enviar pista`, progress `N/M han dado su pista`
  - votacion: one `Votar` button per player row (the row shows the player's name and their pista)
  - adivinanza (Baldomero): grid buttons; blind mode shows coordinates without words
  - final host: buttons `Nueva ronda` and `Cambiar tarjeta`

Rendering rules (secrecy — Global Constraints):
- Mailbox grid (columns A–D, rows 1º–4º) is PUBLIC every phase. Each cell: `data-celda={i}`; the secret cell gets class `chisme` ONLY for non-Baldomero round players (Task 9 reads it to pick wrong guesses).
- Secret panel: non-Baldomero round player sees `El chisme es: <palabra>`; Baldomero sees `🤫 Tú eres Baldomero — finge y memoriza la tarjeta`; spectators (in room but not in `jugadores`) see `Espera a la próxima ronda.` and NO secret, NO inputs.
- Votacion shows every pista with its author name (public speech equivalent) plus the hint `Discutid en voz alta y votad cuando estéis listos.` (voice discussion happens out-of-band). Each player row is an `<li>` containing the name, the pista and exactly one `Votar` button. Vote buttons disabled after voting; progress `N/M han votado`.
- Adivinanza: non-Baldomero players see `<nombre> ha sido descubierto con N votos. Está pensando el chisme…` (+ `sin mirar la tarjeta` when `aCiegas`); Baldomero sees the grid (words hidden when `aCiegas`, coordinates only) + exact attempt text `{state.intentos === 1 ? 'Te queda 1 intento' : `Te quedan ${state.intentos} intentos`}`.
- Final: `🎉 Gana Baldomero (<nombre>)` or `🎉 Ganan los vecinos`; reveals Baldomero name, chisme word, vote counts per player, and `marcador` table. Host buttons `Nueva ronda` (`{t:'nuevaRonda'}`) and `Cambiar tarjeta` (`{t:'reiniciar'}`).

Skeleton (fill each phase block per the rules above):

```svelte
<script lang="ts">
  import { gameStore } from '../../stores/gameStore'
  import { roomStore } from '../../stores/roomStore'
  import { BUZONES } from './buzones'
  import type { BaldomeroState } from './types'

  export let onAction: (a:any)=>void = ()=>{}

  let state: BaldomeroState
  let room: any
  let palabra = ''
  let tarjeta = 0
  $: state = $gameStore as BaldomeroState
  $: room = $roomStore
  $: peers = room.peers as any[]
  $: soyBaldomero = state.baldomeroId === room.selfId
  $: juego = state.jugadores.includes(room.selfId)
  $: chismePalabra = state.chisme >= 0 ? BUZONES[state.tarjeta].palabras[state.chisme] : ''
  function nombre(pid:string){ return peers.find((p:any)=>p.id===pid)?.name || pid.slice(0,4) }

  function empezar(){ onAction({ t:'startGame', config:{ tarjeta } }) }
  function enviarPista(){
    const p = palabra.trim()
    if (!p) return
    onAction({ t:'darPista', palabra: p })
    palabra = ''
  }
  function votar(pid:string){ onAction({ t:'votar', objetivo: pid }) }
  function adivinar(celda:number){ onAction({ t:'adivinar', celda }) }
</script>
```

- [ ] **Step 1: Create the component** per the skeleton + rendering rules (lobby / pistas / votacion / adivinanza / final / spectator).
- [ ] **Step 2: Typecheck + unit suite**

Run: `npm run check && npm run test`
Expected: 0 errors; unit tests pass (registry test resolves `baldomero`).

- [ ] **Step 3: Manual smoke** — `npm run dev`, open `#/sala/prueba1?host=1&name=Ana`: lobby shows card select + blocked-start hint (1 player). (Full round needs 3+ browsers — covered in Task 9.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/baldomero/Baldomero.svelte
git commit -m "feat: add Baldomero game view"
```

---

### Task 8: E2E adaptation (smoke + 3-player P2P round)

**Files:**
- Modify: `tests/e2e/smoke.spec.ts` (rewrite the 2 trivia tests)
- Modify: `tests/e2e/dos-jugadores.spec.ts` (rewrite as 3-context Baldomero round)
- Test: `npx playwright test` (needs browsers: `npx playwright install --with-deps chromium` once)

**Interfaces:**
- Consumes: EXACT strings from Task 7, `data-celda` + `.chisme` grid markup
- Produces: green e2e without trivia references. `tests/e2e/multijugador.spec.ts` needs NO changes (no game assertions).

- [ ] **Step 1: Rewrite the trivia tests in `smoke.spec.ts`**

Replace test 2 (`al empezar el juego…`, lines 17–38) with:

```ts
test('el anfitrión no puede empezar sin 3 vecinos', async ({ page }) => {
  await page.goto('#/')
  await page.getByRole('button', { name: /Crear sala/ }).click()
  await expect(page).toHaveURL(/#\/sala\/[A-Za-z0-9]{6}/)

  await expect(page.getByLabel('Tarjeta de buzones')).toBeVisible()
  await page.getByRole('button', { name: /Empezar partida/ }).click()
  await expect(page.getByText(/Necesitas entre 3 y 8 vecinos/)).toBeVisible()
})
```

Replace test 4 (`configura y termina una trivia…`, lines 60–76) with a lobby render test:

```ts
test('el lobby muestra la tarjeta y el botón de empezar', async ({ page }) => {
  await page.goto('#/sala/corta1?host=1&name=Ana')
  await expect(page.getByLabel('Tarjeta de buzones')).toBeVisible()
  await expect(page.getByRole('button', { name: /Empezar partida/ }).first()).toBeVisible()
})
```

Note: two `Empezar partida` matches can exist (Room lobby + game lobby) — scope with `.first()` or a game container test-id; adjust after running.

- [ ] **Step 2: Rewrite `dos-jugadores.spec.ts` as a 3-context round** (exact content)

```ts
import { expect, test } from '@playwright/test'

const exigeP2P = process.env.E2E_P2P === '1'

test('ronda Baldomero a 3 jugadores por P2P: pistas, votos y victoria vecina', async ({ browser }, testInfo) => {
  test.setTimeout(90_000)
  const baseURL = testInfo.project.use.baseURL as string
  const ctxs = [await browser.newContext(), await browser.newContext(), await browser.newContext()]
  const pages = [await ctxs[0].newPage(), await ctxs[1].newPage(), await ctxs[2].newPage()]
  const names = ['Ana', 'Beto', 'Cloe']

  try {
    await pages[0].goto(`${baseURL}#/`)
    await pages[0].getByRole('button', { name: /Crear sala/ }).click()
    const salaId = pages[0].url().match(/#\/sala\/([a-z0-9]{6})/)?.[1]
    expect(salaId).toBeTruthy()

    await pages[1].goto(`${baseURL}#/sala/${salaId}?name=${names[1]}`)
    await pages[2].goto(`${baseURL}#/sala/${salaId}?name=${names[2]}`)

    try {
      await expect(pages[0].getByText('3/20 jugadores')).toBeVisible({ timeout: 20_000 })
    } catch (error) {
      if (!exigeP2P) {
        test.skip(true, 'Los trackers WebRTC no están accesibles; usa E2E_P2P=1 para exigir esta prueba.')
        return
      }
      throw error
    }

    await pages[0].getByRole('button', { name: /Empezar partida/ }).first().click()
    for (const p of pages) await expect(p.getByLabel('Tu pista')).toBeVisible({ timeout: 10_000 })

    for (let i = 0; i < 3; i++) {
      await pages[i].getByLabel('Tu pista').fill('pista' + i)
      await pages[i].getByRole('button', { name: /Enviar pista/ }).click()
    }
    for (const p of pages) await expect(p.getByRole('button', { name: 'Votar' }).first()).toBeVisible({ timeout: 10_000 })

    // averiguar quién es Baldomero leyendo su propia página (solo él lo ve)
    let bi = -1
    for (let i = 0; i < 3; i++) {
      if (await pages[i].getByText(/Tú eres Baldomero/).count() > 0) bi = i
    }
    expect(bi).toBeGreaterThanOrEqual(0)

    // los vecinos votan a Baldomero; Baldomero vota al primer vecino.
    // Las filas son <li> con el nombre + 1 botón Votar (ver Task 7).
    async function votarEn(page: any, nombre: string) {
      await page.locator('li', { hasText: nombre }).getByRole('button', { name: 'Votar' }).click()
    }
    for (let i = 0; i < 3; i++) {
      await votarEn(pages[i], i === bi ? names[(bi + 1) % 3] : names[bi])
    }

    // Baldomero descubierto: falla 2 veces a propósito (3 jugadores = 2 intentos)
    const bpage = pages[bi]
    await expect(bpage.getByText(/Te quedan 2 intentos/)).toBeVisible({ timeout: 10_000 })
    const chismeCelda = await pages[(bi + 1) % 3].locator('[data-celda].chisme').getAttribute('data-celda')
    const mal1 = (parseInt(chismeCelda!) + 1) % 16
    const mal2 = (parseInt(chismeCelda!) + 2) % 16
    await bpage.locator(`[data-celda="${mal1}"]`).click()
    await expect(bpage.getByText(/Te queda 1 intento/)).toBeVisible()
    await bpage.locator(`[data-celda="${mal2}"]`).click()
    await expect(bpage.getByText(/Ganan los vecinos/)).toBeVisible({ timeout: 10_000 })
  } finally {
    for (const c of ctxs) await c.close()
  }
})
```

Constraints on this test (implementer must enforce in Task 7's markup, adjust here if the run fails):
- Vote buttons must be locatable per player row: each row contains the player name text and one `Votar` button (use `filter({ hasText })`).
- Attempt counters read exactly `Te quedan 2 intentos` then `Te queda 1 intento` (singular!). If Task 7 used a generic `Te quedan N intentos`, change EITHER the component or these two assertions so they match — then re-run.
- The blind-guess variant (`aCiegas`, 7–8 players) is NOT covered e2e (needs 7 contexts); unit-tested in Task 4.

- [ ] **Step 3: Run e2e**

Run: `npx playwright test tests/e2e/smoke.spec.ts`
Expected: PASS (no P2P needed). Then `E2E_P2P=1 npx playwright test tests/e2e/dos-jugadores.spec.ts` where trackers are reachable; elsewhere it skips by design.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/smoke.spec.ts tests/e2e/dos-jugadores.spec.ts
git commit -m "test: adapt e2e to Baldomero"
```

---

### Task 9: Leftover strings + full verification

**Files:**
- Modify: `src/routes/Landing.svelte:27` (`1–20 jugadores · Trivia por turnos · Sin registro` → `3–8 jugadores · Engaño y deducción · Sin registro`)
- Modify: `README.md` (demo/trivia lines → Baldomero; exact lines found via grep in Step 1)
- Modify: `AGENTS.md` (`trivia demo` → Baldomero game; `Next` → this plan file + game per `docs/NUEVO-JUEGO.md`)
- Modify: `docs/NUEVO-JUEGO.md` (every `trivia` path/name example → its `baldomero` counterpart, found via grep in Step 1)

**Interfaces:**
- Consumes: all previous tasks
- Produces: zero `trivia` references outside frozen history (`docs/superpowers/*`, `docs/2026-09-10-sala-fantasma-p2p.md` stay untouched); green `check/test/build`

- [ ] **Step 1: Locate leftovers**

```bash
grep -rn -i "trivia" src README.md AGENTS.md docs/NUEVO-JUEGO.md index.html playwright.config.ts | grep -v superpowers | grep -v sala-fantasma
```

- [ ] **Step 2: Fix each hit** (Landing subtitle exact replacement above; README/AGENTS/NUEVO-JUEGO reworded to Baldomero, keeping meaning).

- [ ] **Step 3: Full verification**

```bash
npm run check && npm run test && npm run build && npx playwright test tests/e2e/smoke.spec.ts
```

Expected: 0 errors, all unit PASS, build OK, smoke PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: reword leftover trivia strings to Baldomero"
```

---
