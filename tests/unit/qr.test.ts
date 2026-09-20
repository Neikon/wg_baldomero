import { describe, expect, it } from 'vitest'
import qrcode from 'qrcode-generator'
import { qrParaSala } from '../../src/lib/utils/qr'

// Dimensiones del GIF generado (cabecera: ancho/alto little-endian en bytes 6-9)
function gifSize(dataUrl: string): [number, number] {
  const bin = atob(dataUrl.split(',')[1])
  const u16 = (i: number) => bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8)
  return [u16(6), u16(8)]
}

describe('qrParaSala', () => {
  it('devuelve vacío sin enlace', () => {
    expect(qrParaSala('')).toBe('')
  })

  it('incluye zona de silencio de 4 módulos alrededor', () => {
    const link = 'https://neikon.github.io/wg_baldomero/#/sala/abc123'
    const url = qrParaSala(link)
    expect(url.startsWith('data:image/gif')).toBe(true)
    const qr = qrcode(0, 'M')
    qr.addData(link)
    qr.make()
    const lado = (qr.getModuleCount() + 8) * 10
    expect(gifSize(url)).toEqual([lado, lado])
  })
})
