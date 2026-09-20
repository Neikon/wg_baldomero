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
