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
