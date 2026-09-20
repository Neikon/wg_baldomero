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
