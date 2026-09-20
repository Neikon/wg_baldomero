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
