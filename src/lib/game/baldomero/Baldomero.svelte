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
  let tarjetaSincronizada = false
  $: state = $gameStore as BaldomeroState
  $: room = $roomStore
  $: peers = ((room && room.peers) || []) as any[]
  $: selfId = (room && room.selfId) as string
  $: esAnfitrion = !!(room && room.isHost)
  $: soyBaldomero = !!state && !!selfId && state.baldomeroId === selfId
  $: juego = !!state && !!selfId && Array.isArray(state.jugadores) && state.jugadores.includes(selfId)
  $: chismePalabra = state && (state.chisme ?? -1) >= 0 && BUZONES[state.tarjeta] && BUZONES[state.tarjeta].palabras[state.chisme]
    ? BUZONES[state.tarjeta].palabras[state.chisme]
    : ''
  function nombre(pid:string){ return (peers || []).find((p:any)=>p.id===pid)?.name || (pid || '').slice(0,4) }

  function empezar(){ onAction({ t:'startGame', config:{ tarjeta } }) }
  function enviarPista(){
    const p = palabra.trim()
    if (!p) return
    onAction({ t:'darPista', palabra: p })
    palabra = ''
  }
  function votar(pid:string){ onAction({ t:'votar', objetivo: pid }) }
  function adivinar(celda:number){ onAction({ t:'adivinar', celda }) }

  // Derivados defensivos: el store arranca con un estado base sin campos de Baldomero.
  $: jugadores = (state && Array.isArray(state.jugadores) && state.jugadores) || []
  $: pistas = (state && state.pistas) || {}
  $: votos = (state && state.votos) || {}
  $: marcador = (state && state.marcador) || {}
  $: descubiertos = (state && Array.isArray(state.descubiertos) && state.descubiertos) || []
  $: nVecinos = Object.keys(marcador).length || peers.length
  $: fueraDeRango = nVecinos < 3 || nVecinos > 8
  $: nPistas = Object.keys(pistas).length
  $: nVotos = Object.keys(votos).length
  $: yaDioPista = !!selfId && pistas[selfId] !== undefined
  $: yaVoto = !!selfId && votos[selfId] !== undefined
  $: tarjetaSegura = state && Number.isInteger(state.tarjeta) && state.tarjeta >= 0 && state.tarjeta < BUZONES.length ? state.tarjeta : 0
  $: palabras = BUZONES[tarjetaSegura].palabras
  $: nombreTarjeta = BUZONES[tarjetaSegura].nombre
  $: puedeAdivinar = !!state && state.phase === 'adivinanza' && juego && soyBaldomero

  // La selección inicial del anfitrión parte de la tarjeta del estado.
  $: if (!tarjetaSincronizada && state && Number.isInteger(state.tarjeta)) {
    tarjeta = state.tarjeta
    tarjetaSincronizada = true
  }

  function elegir(e: Event){
    const v = parseInt((e.currentTarget as HTMLSelectElement).value, 10)
    if (!Number.isInteger(v) || v < 0 || v >= BUZONES.length) return
    tarjeta = v
    onAction({ t:'elegirTarjeta', tarjeta: v })
  }

  function coord(i: number): string {
    return `${'ABCD'[i % 4]}-${Math.floor(i / 4) + 1}º`
  }

  function votosPara(pid: string): number {
    return Object.values(votos).filter((v) => v === pid).length
  }

  function textoCelda(i: number, p: string): string {
    if (state && state.phase === 'adivinanza' && soyBaldomero && state.aCiegas) return coord(i)
    return p
  }

  function enviarConEnter(e: KeyboardEvent){
    if (e.key === 'Enter') enviarPista()
  }
</script>

<style>
  .rejilla { display: grid; grid-template-columns: auto repeat(4, 1fr); gap: 0.35rem; align-items: stretch; }
  .rejilla .cab { color: var(--muted); font-size: 0.8rem; text-align: center; align-self: center; }
  .rejilla button { min-height: 2.4rem; font-size: 0.75rem; padding: 0.3rem; overflow-wrap: anywhere; }
  .chisme { outline: 3px solid var(--accent); }
</style>

<div>
  {#if state && state.phase !== 'lobby'}
    <p class="muted" style="font-size:0.85rem">Ronda {state.ronda}</p>
  {/if}

  {#if !state || state.phase === 'lobby'}
    <!-- ============ LOBBY ============ -->
    {#if esAnfitrion}
      <div style="display:grid;gap:0.6rem">
        <div>
          <label for="tarjeta">Tarjeta de buzones</label>
          <select id="tarjeta" value={tarjeta} on:change={elegir}>
            {#each BUZONES as b, i}
              <option value={i}>{i + 1} – {b.nombre}</option>
            {/each}
          </select>
        </div>
        <div>
          <button on:click={empezar} disabled={fueraDeRango}>Empezar partida</button>
        </div>
        {#if fueraDeRango}
          <p class="muted">Necesitas entre 3 y 8 vecinos en la sala (ahora: {nVecinos}).</p>
        {/if}
      </div>
    {:else}
      <p>Esperando a que el anfitrión empiece la partida…</p>
    {/if}
  {:else if state.phase === 'pistas'}
    <!-- ============ PISTAS ============ -->
    {#if juego && !soyBaldomero}
      <p>El chisme es: {chismePalabra}</p>
    {:else if juego && soyBaldomero}
      <p>🤫 Tú eres Baldomero — finge y memoriza la tarjeta</p>
    {:else}
      <p>Espera a la próxima ronda.</p>
    {/if}
    {#if juego}
      <div style="display:grid;gap:0.5rem;margin:0.6rem 0">
        <div>
          <label for="pista">Tu pista</label>
          <input id="pista" bind:value={palabra} on:keydown={enviarConEnter} disabled={yaDioPista} maxlength={30} placeholder="Una palabra…" style="width:100%" />
        </div>
        <div>
          <button on:click={enviarPista} disabled={yaDioPista || !palabra.trim()}>Enviar pista</button>
        </div>
        {#if yaDioPista}
          <p class="muted">Pista enviada. Esperando al resto…</p>
        {/if}
      </div>
      <p>{nPistas}/{jugadores.length} han dado su pista</p>
    {/if}
    {#if esAnfitrion}
      <div style="display:flex;gap:0.5rem;margin-top:0.6rem;flex-wrap:wrap">
        <button on:click={() => onAction({ t:'reiniciar' })} style="background:var(--muted)">Cancelar ronda</button>
      </div>
    {/if}
  {:else if state.phase === 'votacion'}
    <!-- ============ VOTACIÓN ============ -->
    {#if juego && !soyBaldomero}
      <p>El chisme es: {chismePalabra}</p>
    {:else if juego && soyBaldomero}
      <p>🤫 Tú eres Baldomero — finge y memoriza la tarjeta</p>
    {:else}
      <p>Espera a la próxima ronda.</p>
    {/if}
    <p>Discutid en voz alta y votad cuando estéis listos.</p>
    <ul style="list-style:none;padding:0;display:grid;gap:0.4rem">
      {#each jugadores as pid}
        <li style="display:flex;justify-content:space-between;align-items:center;gap:0.6rem;background:var(--card);padding:0.5rem 0.8rem;border-radius:8px">
          <span>{nombre(pid)}: «{pistas[pid] ?? '…'}»</span>
          {#if juego}
            <button on:click={() => votar(pid)} disabled={yaVoto || pid === selfId} style="padding:0.3rem 0.7rem;font-size:0.85rem">Votar</button>
          {/if}
        </li>
      {/each}
    </ul>
    <p>{nVotos}/{jugadores.length} han votado</p>
    {#if esAnfitrion}
      <div style="display:flex;gap:0.5rem;margin-top:0.6rem;flex-wrap:wrap">
        <button on:click={() => onAction({ t:'reiniciar' })} style="background:var(--muted)">Cancelar ronda</button>
      </div>
    {/if}
  {:else if state.phase === 'adivinanza'}
    <!-- ============ ADIVINANZA ============ -->
    {#if juego && soyBaldomero}
      <p>{state.intentos === 1 ? 'Te queda 1 intento' : `Te quedan ${state.intentos} intentos`}</p>
      {#if state.adivinanza != null}
        <p class="muted">Tu último intento ({coord(state.adivinanza)}) no era el chisme.</p>
      {/if}
    {:else}
      {#if juego && !soyBaldomero}
        <p>El chisme es: {chismePalabra}</p>
      {:else if !juego}
        <p>Espera a la próxima ronda.</p>
      {/if}
      {#each descubiertos as pid}
        <p>{nombre(pid)} ha sido descubierto con {votosPara(pid)} votos. Está pensando el chisme…{#if state.aCiegas} sin mirar la tarjeta.{/if}</p>
      {/each}
      {#if descubiertos.length === 0}
        <p>Baldomero está pensando el chisme…{#if state.aCiegas} sin mirar la tarjeta.{/if}</p>
      {/if}
    {/if}
    {#if esAnfitrion}
      <div style="display:flex;gap:0.5rem;margin-top:0.6rem;flex-wrap:wrap">
        <button on:click={() => onAction({ t:'reiniciar' })} style="background:var(--muted)">Cancelar ronda</button>
      </div>
    {/if}
  {:else if state.phase === 'final'}
    <!-- ============ FINAL ============ -->
    {#if state.ganador === 'baldomero'}
      <p>🎉 Gana Baldomero ({nombre(state.baldomeroId)})</p>
    {:else}
      <p>🎉 Ganan los vecinos</p>
    {/if}
    <p>Baldomero era: {nombre(state.baldomeroId)}</p>
    <p>El chisme era: {chismePalabra}</p>
    <h4>Votos</h4>
    <ul style="list-style:none;padding:0;display:grid;gap:0.4rem">
      {#each jugadores as pid}
        <li>{nombre(pid)}: {votosPara(pid)} votos</li>
      {/each}
    </ul>
    <h4>Marcador</h4>
    <table>
      <thead><tr><th>Vecino</th><th>Puntos</th></tr></thead>
      <tbody>
        {#each Object.keys(marcador) as pid}
          <tr><td>{nombre(pid)}</td><td>{marcador[pid] ?? 0}</td></tr>
        {/each}
      </tbody>
    </table>
    {#if esAnfitrion}
      <div style="display:flex;gap:0.5rem;margin-top:0.8rem;flex-wrap:wrap">
        <button on:click={() => onAction({ t:'nuevaRonda' })}>Nueva ronda</button>
        <button on:click={() => onAction({ t:'reiniciar' })} style="background:var(--muted)">Cambiar tarjeta</button>
      </div>
    {:else}
      <p class="muted">Esperando al anfitrión…</p>
    {/if}
  {:else}
    <p class="muted">Fase desconocida: {state.phase}</p>
  {/if}

  <!-- ============ TARJETA DE BUZONES (pública) ============ -->
  <div style="margin-top:1rem">
    <p><strong>Tarjeta: {nombreTarjeta}</strong></p>
    <div class="rejilla">
      <span></span><span class="cab">A</span><span class="cab">B</span><span class="cab">C</span><span class="cab">D</span>
      {#each [0, 1, 2, 3] as fila}
        <span class="cab">{fila + 1}º</span>
        {#each [0, 1, 2, 3] as col}
          <button
            type="button"
            data-celda={fila * 4 + col}
            class:chisme={juego && !soyBaldomero && fila * 4 + col === state.chisme}
            disabled={!puedeAdivinar}
            on:click={() => adivinar(fila * 4 + col)}
            aria-label={`Celda ${coord(fila * 4 + col)}`}
            title={coord(fila * 4 + col)}
          >{textoCelda(fila * 4 + col, palabras[fila * 4 + col])}</button>
        {/each}
      {/each}
    </div>
  </div>
</div>
