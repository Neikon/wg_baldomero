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
    await pages[0].getByPlaceholder('Tu nombre').fill(names[0])
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
