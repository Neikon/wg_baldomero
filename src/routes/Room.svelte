<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { roomStore, initRoom } from '../lib/stores/roomStore'
  import { gameStore } from '../lib/stores/gameStore'
  import { assignName, sanitizeName } from '../lib/utils/names'
  import { electNewHost, isRoomFull } from '../lib/net/room'
  import { joinTrystero, relayStatus } from '../lib/net/trysteroAdapter'
  import { readTurnServers, refreshTurnServers, turnApiUrl, guardarTurnApi, type TurnServer } from '../lib/net/turn'
  import { debugLog, downloadText } from '../lib/net/debug'
  import { diagnosticarRed } from '../lib/net/iceCheck'
  import { buildRtcConfig } from '../lib/net/transport'
  import { DEFAULT_GAME_ID, getGameModule } from '../lib/game/registry'
  import PlayerList from '../components/PlayerList.svelte'
  import ShareLink from '../components/ShareLink.svelte'
  import NameInput from '../components/NameInput.svelte'
  import Game from './Game.svelte'

  let salaId = ''
  let isHostParam = false
  let initialName = ''
  // Plantilla de un solo juego: juegoId es siempre el registrado por defecto.
  // El campo juegoId se mantiene en el protocolo para robustez entre versiones.
  let juegoId = DEFAULT_GAME_ID
  let trystero: any = null
  let unsubRoom: any
  let unsubGame: any
  let joinOrder: string[] = []
  let selfId = ''
  let hostId = ''
  let isHost = false
  let peers: any[] = []
  let gameState: any = { phase:'lobby', version:0, gameId: DEFAULT_GAME_ID }
  let salaFull = false
  let toast = ''
  let timerInt: any = null
  let heartbeat: any = null
  const transportToLogicalPeer = new Map<string, string>()
  // Señalización (trackers): X de Y sockets abiertos. Con 0 abiertos la sala
  // es fantasma —la malla de datos vive pero nadie nuevo puede entrar—.
  // El aviso de fantasma lleva gracia inicial: al cargar, los sockets tardan
  // unos segundos en abrir y un 0/4 fugaz sería un falso positivo.
  let relaysAbiertos = 0
  let relaysTotal = 0
  const SIN_SENAL_MS = 8000
  // Reloj reactivo (1 s) para que las condiciones con Date.now() se reevalúen
  // aunque los contadores no cambien.
  let ahora = Date.now()
  let relaysPrev = new Map<string, boolean>()
  function actualizarRelays(){
    try {
      const st = relayStatus()
      relaysTotal = st.length
      relaysAbiertos = st.filter((s)=>s.open).length
      for (const s of st) {
        const antes = relaysPrev.get(s.url)
        if (antes !== undefined && antes !== s.open) {
          debugLog.log('red', `tracker ${s.open ? 'abierto' : 'CERRADO'}: ${s.url}`)
        }
        relaysPrev.set(s.url, s.open)
      }
    } catch { /* sin red: se reintenta en el siguiente tick */ }
  }
  // Depuración (?debug=1): registro exportable de red+protocolo.
  let debug = false
  let debugTexto = ''
  $: debugCount = debugTexto ? debugTexto.split('\n').length : 0
  function uaCorta(): string {
    try { return navigator.userAgent } catch { return 'sin-UA' }
  }
  // TURN (datos móviles): URL del endpoint + estado para el lobby.
  let turnApiTxt = ''
  let turnMsg = ''
  let turnCount = 0
  function guardarTurn() {
    if (guardarTurnApi(turnApiTxt)) {
      turnMsg = 'URL guardada; obteniendo servidores…'
      refreshTurnServers()
        .then((list) => {
          turnCount = list.length > 0 ? list.length : readTurnServers().length
          turnMsg = turnCount > 0 ? `TURN activo (${turnCount} servidores). Recarga la sala para usarlo.` : 'Sin respuesta del endpoint; revisa la URL.'
        })
        .catch(() => {
          turnMsg = 'Sin respuesta del endpoint; revisa la URL.'
        })
    } else {
      turnMsg = 'La URL debe empezar por https://'
    }
  }
  // Curación del invitado atascado: si tras 30 s solo se ve a sí mismo,
  // recarga dura topada (sanea el pool global de Trystero; el rejoin en
  // caliente no lo hace). Topada para no ciclar si la sala ya no existe.
  let joinedAt = 0
  let watch: any = null
  const HARD_RELOAD_MS = 30000
  const MAX_HARD_RELOADS = 2
  const reloadKey = () => `wg_template:reloads:${salaId}`
  const reloadsHechas = () => {
    try { return parseInt(sessionStorage.getItem(reloadKey()) || '0', 10) || 0 } catch { return MAX_HARD_RELOADS }
  }

  function parseHash(){
    const hash = location.hash // #/sala/abcd12?host=1&name=...
    const m = hash.match(/#\/sala\/([a-z0-9]{6})/)
    salaId = m ? m[1] : ''
    const q = new URLSearchParams(hash.split('?')[1] || '')
    isHostParam = q.get('host') === '1'
    initialName = q.get('name') ? decodeURIComponent(q.get('name')!) : ''
    debug = q.get('debug') === '1'
  }

  function showToast(msg:string){
    toast=msg; setTimeout(()=>toast='', 4000)
  }

  function broadcastState(){
    if (!trystero || !isHost) return
    const fullState = gameState
    const msg = { t:'stateSync', juegoId, fullState, version: fullState.version, hostId, peers, joinOrder }
    trystero.send(msg)
  }

  function handleAction(action:any, from:string){
    // solo host aplica reducer
    if (!isHost) return
    const game = getGameModule(juegoId)
    if (!game) return
    if (action.t === 'startGame' && action.juegoId && action.juegoId !== juegoId) return
    // El reducer corre en el host, pero ctx.isHost describe al autor de la acción.
    // Así un invitado puede responder/votar sin poder iniciar o avanzar la partida.
    const ctx = { isHost: from === hostId, peerId: from }
    const next = game.reducer(gameState, action, ctx)
    if (next !== gameState) {
      gameState = next
      gameStore.set(gameState)
      broadcastState()
    }
  }

  function startTimerAndHeartbeat(){
    if (timerInt) clearInterval(timerInt)
    if (heartbeat) clearInterval(heartbeat)
    // El host ofrece un pulso genérico; cada reducer decide si usa `tick`.
    timerInt = setInterval(()=>{
      if (isHost) {
        handleAction({t:'tick'}, selfId)
      }
      ahora = Date.now()
      if (debug) debugTexto = debugLog.tail(80)
    }, 1000)
    // heartbeat stateSync cada 2s si host (+ refresco del estado de trackers)
    heartbeat = setInterval(()=>{
      if (isHost) broadcastState()
      actualizarRelays()
    }, 2000)
  }

  onMount(()=>{
    parseHash()
    if (!salaId) { location.hash = '#/'; return }
    let cancelled = false
    turnApiTxt = turnApiUrl() ?? ''
    turnCount = readTurnServers().length
    if (debug) {
      let recargas = 0
      try { recargas = parseInt(sessionStorage.getItem(`wg_template:reloads:${salaId}`) || '0', 10) || 0 } catch { /* sin storage */ }
      debugLog.enable({ sala: salaId, rol: isHostParam ? 'host' : 'invitado', ua: uaCorta(), recargasDuras: String(recargas) })
      // Chequeo automático al entrar en debug: el log trae siempre el veredicto.
      void probarRed()
    }
    // el id recién parseado manda: la suscripción al store dispara primero con
    // datos de una sala anterior y no debe pisarlo (ver roadmap punto 4)
    const freshSalaId = salaId
    // estado limpio al (re)entrar en una sala: el store puede traer datos de otra anterior
    gameStore.set({ phase: 'lobby', version: 0, gameId: juegoId })
    // nombre inicial: del query o Jugador N (se asignará tras ver peers)
    let nameToUse = initialName && sanitizeName(initialName) ? sanitizeName(initialName)! : ''
    // suscribirse a stores (sin sincronizar salaId: es fijo durante la vida de Room)
    unsubRoom = roomStore.subscribe(v=>{
      peers = v.peers; hostId = v.hostId; isHost = v.isHost; selfId = v.selfId; joinOrder = v.joinOrder
    })
    unsubGame = gameStore.subscribe(v=> gameState = v)

    // iniciar room
    if (isHostParam) {
      if (!nameToUse) nameToUse = assignName(1)
      initRoom(freshSalaId, nameToUse, true)
      // init game
      const initPeers = [{id: selfId, name: nameToUse}] as any
      const game = getGameModule(juegoId)
      const initState = game
        ? game.createInitialState(initPeers)
        : { phase: 'lobby', version: 0, gameId: juegoId }
      gameStore.set(initState); gameState = initState
    } else {
      // guest: asignaremos nombre tras conectar, provisional
      if (!nameToUse) {
        // se asignará al recibir peers, por ahora Jugador ?
        nameToUse = assignName(2)
      }
      initRoom(freshSalaId, nameToUse, false)
    }

    // La entrada es async (TURN puede esperar ≤4 s); el cleanup va por `release`
    // porque onMount sync no puede devolver lo de dentro de la promesa.
    let release: (() => void) | undefined
    const entrar = async () => {
    // TURN (datos móviles): lectura síncrona de caché; si hay API configurada
    // pero nada cacheado, se espera al refresco (≤4 s). Sin TURN, inmediato.
    refreshTurnServers().catch(() => {})
    let turn: TurnServer[] = readTurnServers()
    if (turn.length === 0 && turnApiUrl()) {
      showToast('Obteniendo TURN…')
      turn = await refreshTurnServers().catch(() => [] as TurnServer[])
      turnCount = readTurnServers().length
    }
    if (cancelled) return

    // conectar Trystero
    try {
      trystero = joinTrystero(freshSalaId, turn)
    } catch(e){
      console.error('Trystero error', e)
      showToast('Error conectando P2P')
      return
    }
    // Un solo punto de envío: registra todo lo que sale sin tocar el protocolo.
    {
      const rawSend = trystero.send.bind(trystero)
      trystero.send = (m: any) => {
        try {
          debugLog.log('proto', `→ ${m?.t ?? '?'} (${JSON.stringify(m ?? null).length}B)`)
        } catch { /* log best-effort */ }
        return rawSend(m)
      }
    }

    // manejar mensajes
    trystero.get((msg:any, peerId:string)=>{
      if (!msg || !msg.t) return
      try {
        const extra = msg.t === 'stateSync' && msg.peers ? ` (${msg.peers.length} peers)` : ''
        debugLog.log('proto', `← ${msg.t} de ${peerId}${extra} (${JSON.stringify(msg).length}B)`)
      } catch { /* log best-effort */ }
      if (msg.t === 'hello') {
        transportToLogicalPeer.set(peerId, msg.peerId)
        // solo host gestiona hello
        if (isHost) {
          if (isRoomFull(peers.length)) {
            trystero.send({t:'roomFull', salaId})
            return
          }
          const existing = peers.find((p:any)=>p.id===msg.peerId)
          if (!existing) {
            const newPeer = { id: msg.peerId, name: msg.name, joinTime: msg.joinTime }
            peers = [...peers, newPeer]
            joinOrder = [...joinOrder, msg.peerId]
            roomStore.update(v=>({...v, peers, joinOrder, version: v.version+1}))
            const previousState = gameState
            handleAction({ t: 'playerJoined', peerId: msg.peerId }, selfId)
            if (gameState === previousState) broadcastState()
          }
        }
      } else if (msg.t === 'requestState') {
        if (isHost) broadcastState()
      } else if (msg.t === 'stateSync') {
        const incomingJuegoId = msg.juegoId || msg.fullState?.gameId || DEFAULT_GAME_ID
        const gameChanged = incomingJuegoId !== juegoId
        if (gameChanged) {
          juegoId = incomingJuegoId
        }
        // validar version
        if (!gameChanged && msg.version !== undefined && gameState.version !== undefined && msg.version <= gameState.version) {
          // ignorar viejo
          // pero actualizar peers/joinOrder si host cambió
        } else {
          gameState = msg.fullState
          gameStore.set(gameState)
        }
        // actualizar room peers/host
        if (msg.peers) {
          peers = msg.peers
          hostId = msg.hostId
          joinOrder = msg.joinOrder || joinOrder
          // actualizar isHost si somos nuevo host
          const amHost = hostId === selfId
          if (amHost !== isHost) {
            isHost = amHost
            roomStore.update(v=>({...v, hostId, peers, joinOrder, isHost}))
            if (isHost) showToast('Ahora eres el anfitrión')
          } else {
            roomStore.update(v=>({...v, hostId, peers, joinOrder}))
          }
        }
      } else if (msg.t === 'action') {
        const logicalPeerId = transportToLogicalPeer.get(peerId) || msg.from
        if (!msg.juegoId || msg.juegoId === juegoId) handleAction(msg.action, logicalPeerId)
      } else if (msg.t === 'rename') {
        if (isHost) {
          const logicalPeerId = transportToLogicalPeer.get(peerId) || msg.peerId
          peers = peers.map((p:any)=> p.id===logicalPeerId ? {...p, name: msg.newName} : p)
          roomStore.update(v=>({...v, peers}))
          broadcastState()
        }
      } else if (msg.t === 'roomFull') {
        salaFull = true
        showToast('Sala llena (20/20)')
      }
    })

    trystero.onPeerJoin((id:string)=>{
      debugLog.log('red', `peer transporte unido: ${id}`)
      // enviar hello
      const selfName = (peers.find((p:any)=>p.id===selfId)?.name) || nameToUse
      trystero.send({t:'hello', peerId: selfId, name: selfName, joinTime: Date.now()})
      // si somos host, no-op, peer nos enviará hello
      // si somos guest, pedir estado tras 1s si no llega
      setTimeout(()=>{
        if (!isHost && gameState.phase==='lobby' && peers.length<=1) {
          trystero.send({t:'requestState', from: selfId})
        }
      }, 1200)
    })

    trystero.onPeerLeave((transportPeerId:string)=>{
      debugLog.log('red', `peer transporte fuera: ${transportPeerId}`)
      const id = transportToLogicalPeer.get(transportPeerId) || transportPeerId
      transportToLogicalPeer.delete(transportPeerId)
      const wasHost = id === hostId
      peers = peers.filter((p:any)=>p.id!==id)
      // joinOrder se mantiene para elección determinista, pero connected set cambia
      const connected = new Set(peers.map((p:any)=>p.id))
      roomStore.update(v=>({...v, peers}))
      if (wasHost) {
        const newHost = electNewHost(joinOrder, connected)
        if (newHost) {
          hostId = newHost
          const amNewHost = newHost === selfId
          isHost = amNewHost
          roomStore.update(v=>({...v, hostId, isHost}))
          if (amNewHost) {
            showToast('El anfitrión se fue — ahora eres el anfitrión')
            broadcastState()
          } else {
            showToast('Anfitrión migrado a ' + (peers.find((p:any)=>p.id===newHost)?.name || newHost.slice(0,4)))
          }
        } else {
          showToast('Sala vacía')
        }
      }
    })

    // si somos host, iniciar timers
    startTimerAndHeartbeat()

    // guest: ya está suscrito, esperar sync

    // si guest, pedir estado inicial
    if (!isHostParam) {
      setTimeout(()=> trystero.send({t:'requestState', from: selfId}), 800)
    }

    joinedAt = Date.now()
    actualizarRelays()
    // vigía del invitado atascado (limbo): solo se ve a sí mismo y no avanza
    watch = setInterval(()=>{
      if (peers.length > 1) {
        try { sessionStorage.removeItem(reloadKey()) } catch {}
        return
      }
      if (isHost) return
      const edad = Date.now() - joinedAt
      const sinSenal = relaysTotal > 0 && relaysAbiertos === 0
      if ((edad > HARD_RELOAD_MS || (sinSenal && edad > 10000)) && reloadsHechas() < MAX_HARD_RELOADS) {
        try { sessionStorage.setItem(reloadKey(), String(reloadsHechas() + 1)) } catch {}
        debugLog.log('sys', 'recarga dura por falta de sync')
        location.reload()
      }
    }, 2000)

    release = ()=>{
      if (watch) clearInterval(watch)
      if (trystero) trystero.leave()
    }
    }
    void entrar()
    return ()=>{
      cancelled = true
      release?.()
    }
  })

  onDestroy(()=>{
    if (unsubRoom) unsubRoom()
    if (unsubGame) unsubGame()
    if (watch) clearInterval(watch)
    if (timerInt) clearInterval(timerInt)
    if (heartbeat) clearInterval(heartbeat)
    if (trystero) trystero.leave()
  })

  function onRename(e:CustomEvent){
    const newName = e.detail as string
    // enviar rename al host
    if (isHost) {
      peers = peers.map((p:any)=> p.id===selfId ? {...p, name:newName} : p)
      roomStore.update(v=>({...v, peers, selfName:newName}))
      broadcastState()
    } else {
      trystero.send({t:'rename', peerId: selfId, newName})
      // optimista local
      roomStore.update(v=>({...v, selfName:newName}))
    }
    showToast('Nombre cambiado a ' + newName)
  }

  function handleGameAction(a:any){
    const action = a.t === 'startGame' ? { ...a, juegoId } : a
    if (isHost) {
      handleAction(action, selfId)
    } else {
      trystero.send({t:'action', juegoId, action, from: selfId})
    }
  }

  function salir(){
    if (trystero) trystero.leave()
    location.hash = '#/'
  }

  function copiarLog(){
    const txt = debugLog.toText()
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(
          () => showToast('Log copiado'),
          () => showToast('No se pudo copiar')
        )
      } else {
        showToast('Portapapeles no disponible')
      }
    } catch {
      showToast('No se pudo copiar')
    }
  }

  function descargarLog(){
    const ok = downloadText(`wg_template-${salaId}.log`, debugLog.toText())
    showToast(ok ? 'Log descargado' : 'No se pudo descargar')
  }

  /** Chequeo activo de red: reúne candidatos ICE y vuelca el veredicto al log. */
  async function probarRed(){
    showToast('Probando red…')
    debugLog.log('sys', 'chequeo ICE iniciado')
    const v = await diagnosticarRed(buildRtcConfig(readTurnServers())).catch(() => null)
    if (!v) {
      showToast('Chequeo no disponible')
      return
    }
    debugLog.log('sys', `ICE host=[${v.host.join(',') || '—'}] srflx=[${v.srflx.join(',') || '—'}] relay=[${v.relay.join(',') || '—'}] => ${v.veredicto}`)
    showToast(
      v.veredicto === 'P2P_OK'
        ? 'Red OK para P2P'
        : v.veredicto === 'SOLO_TURN'
          ? 'P2P solo con TURN'
          : 'Red NO apta para P2P directo'
    )
  }

  /** Activa el modo debug recargando con &debug=1 (instrumenta desde el join).
   *  El router solo remonta por salaId, así que sin recarga no tendría efecto. */
  function activarDebug(){
    const h = location.hash
    if (/[?&]debug=1/.test(h)) return
    location.hash = h.includes('?') ? `${h}&debug=1` : `${h}?debug=1`
    location.reload()
  }
</script>

<div class="container">
  {#if toast}<div style="background:var(--success);color:var(--bg);padding:0.6rem 1rem;border-radius:8px;margin:1rem 0">{toast}</div>{/if}
  {#if salaFull}<div style="background:var(--error);color:white;padding:0.6rem 1rem;border-radius:8px;margin:1rem 0">Sala llena (20 jugadores)</div>{/if}

  {#if gameState.phase === 'lobby'}
    <!-- ============ LOBBY ============ -->
    <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
      <h2>Sala <code>{salaId}</code> {#if isHost}<span style="background:var(--accent);color:var(--bg);padding:2px 6px;border-radius:4px;font-size:0.7rem">Anfitrión</span>{/if}</h2>
      <button on:click={salir} style="background:var(--muted)">Salir</button>
    </div>

    <ShareLink {salaId} />

    {#if relaysTotal > 0}
      <p class="muted" style="font-size:0.8rem;margin:0.4rem 0 0">Señalización: {relaysAbiertos}/{relaysTotal} trackers
        {#if !debug}
          <button on:click={activarDebug} style="background:none;border:none;padding:0 0 0 0.4rem;margin:0;min-height:0;font-size:0.8rem;font-weight:400;color:var(--muted);text-decoration:underline;cursor:pointer">depurar</button>
        {/if}
      </p>
    {/if}
    {#if isHost && relaysTotal > 0 && relaysAbiertos === 0 && ahora - joinedAt > SIN_SENAL_MS}
      <div style="background:var(--error);color:white;padding:0.6rem 1rem;border-radius:8px;margin:0.6rem 0;display:flex;gap:0.6rem;align-items:center;justify-content:space-between;flex-wrap:wrap">
        <span>Sin conexión con los trackers: ningún jugador nuevo puede entrar. Recarga la página para re-anunciar la sala.</span>
        <button on:click={()=>location.reload()} style="background:white;color:var(--error);padding:0.3rem 0.7rem;font-size:0.85rem">Recargar</button>
      </div>
    {/if}
    <details style="margin-top:0.6rem;font-size:0.85rem">
      <summary class="muted" style="cursor:pointer">Datos móviles: TURN ({turnCount} activos)</summary>
      <p class="muted">Con datos, el UDP directo a veces no cruza y nadie entra aunque haya señalización. Pega tu URL de credenciales TURN (Metered, gratis) y se usará al entrar.</p>
      <div style="display:flex;gap:0.4rem">
        <input bind:value={turnApiTxt} placeholder="https://….metered.live/api/v1/turn/credentials?apiKey=…" aria-label="URL de credenciales TURN" style="flex:1;min-width:0" />
        <button on:click={guardarTurn} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Guardar</button>
      </div>
      {#if turnMsg}<p class="muted">{turnMsg}</p>{/if}
    </details>
    {#if debug}
      <details style="margin-top:0.6rem;font-size:0.85rem">
        <summary class="muted" style="cursor:pointer">Registro de depuración ({debugCount} líneas)</summary>
        <div style="display:flex;gap:0.4rem;margin:0.4rem 0;flex-wrap:wrap">
          <button on:click={copiarLog} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Copiar</button>
          <button on:click={descargarLog} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Descargar</button>
          <button on:click={()=>void probarRed()} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Probar mi red</button>
        </div>
        <pre style="max-height:220px;overflow:auto;background:var(--bg);border:1px solid var(--muted);border-radius:8px;padding:0.5rem;font-size:0.75rem;white-space:pre-wrap;overflow-wrap:anywhere">{debugTexto}</pre>
      </details>
    {/if}

    <div style="display:grid;gap:1rem;margin-top:1rem">
      <div>
        <Game {juegoId} onAction={handleGameAction} />
      </div>
      <div>
        <h3>Jugadores ({peers.length}/20)</h3>
        <PlayerList peers={peers} hostId={hostId} />
        <div style="margin-top:1rem">
          <h4>Cambiar nombre</h4>
          <NameInput value={peers.find(p=>p.id===selfId)?.name || ''} on:save={onRename} />
        </div>
      </div>
    </div>
  {:else}
    <!-- ============ JUEGO ============ -->
    <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.8rem">
      <span class="muted" style="font-size:0.85rem"><code>{salaId}</code></span>
      <button on:click={salir} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Salir</button>
    </div>

    <Game {juegoId} onAction={handleGameAction} />
  {/if}
</div>
