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
