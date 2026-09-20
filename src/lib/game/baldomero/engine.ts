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
  return state
}
