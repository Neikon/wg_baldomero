import { test, expect } from '@playwright/test'

test('landing renderiza y crear sala lleva al lobby', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('#/')
  await expect(page.getByRole('heading', { name: /El portero Baldomero/ })).toBeVisible()
  await page.getByRole('button', { name: /Crear sala/ }).click()

  await expect(page).toHaveURL(/#\/sala\/[A-Za-z0-9]{6}/)
  await expect(page.getByRole('heading', { name: /Sala/ })).toBeVisible()

  expect(errors).toEqual([])
})

test('el anfitrión no puede empezar sin 3 vecinos', async ({ page }) => {
  await page.goto('#/')
  await page.getByRole('button', { name: /Crear sala/ }).click()
  await expect(page).toHaveURL(/#\/sala\/[A-Za-z0-9]{6}/)

  await expect(page.getByLabel('Tarjeta de buzones')).toBeVisible()
  await expect(page.getByRole('button', { name: /Empezar partida/ })).toBeDisabled()
  await expect(page.getByText(/Necesitas entre 3 y 8 vecinos/)).toBeVisible()
})

test('crear una segunda sala muestra datos limpios de la nueva', async ({ page }) => {
  await page.goto('#/')
  await page.getByRole('button', { name: /Crear sala/ }).click()
  await expect(page).toHaveURL(/#\/sala\/([A-Za-z0-9]{6})/)
  const urlA = page.url()
  const salaA = urlA.match(/#\/sala\/([A-Za-z0-9]{6})/)![1]

  await page.getByRole('button', { name: 'Salir' }).click()
  await expect(page.getByRole('heading', { name: /El portero Baldomero/ })).toBeVisible()

  await page.getByRole('button', { name: /Crear sala/ }).click()
  await expect(page).toHaveURL(/#\/sala\/([A-Za-z0-9]{6})/)
  const salaB = page.url().match(/#\/sala\/([A-Za-z0-9]{6})/)![1]
  expect(salaB).not.toBe(salaA)

  // lobby limpio de la sala B
  await expect(page.getByRole('heading', { name: new RegExp(salaB) })).toBeVisible()
  await expect(page.getByText('1/20 jugadores')).toBeVisible()
})

test('el lobby muestra la tarjeta y el botón de empezar', async ({ page }) => {
  await page.goto('#/sala/corta1?host=1&name=Ana')
  await expect(page.getByLabel('Tarjeta de buzones')).toBeVisible()
  await expect(page.getByRole('button', { name: /Empezar partida/ }).first()).toBeVisible()
})
