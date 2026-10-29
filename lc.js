// LAUNCHCODE: the page. Polls the relay's armed and fired launches; arming signs the coin's pump.fun launch on the
// creator's durable nonce (with a small Jito tip) and hands it to the relay with its trigger.
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const Q = new URLSearchParams(location.search)
// everything goes through this site's proxy (/api/r); ?relay=<url> talks to a relay directly (local testing)
const RELAY = Q.get('relay')
const get = (p, q = '') => fetch(RELAY ? `${RELAY}/v1/${p}?${q}` : `/api/r?path=${p}&${q}`, { cache: 'no-store' }).then((r) => r.json())
const post = (p, b) => fetch(RELAY ? `${RELAY}/v1/${p}` : `/api/r?path=${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json())
const rpc = async (method, params) => { const r = await post('rpc', { method, params }); if (r.error) throw new Error(r.error); return r.result }
const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? Math.floor(s) + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h' }
const left = (t) => { const s = Math.max(0, (t - Date.now()) / 1000); return s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm' }
let toastT; const toast = (m, bad) => { const t = $('toast'); t.textContent = m; t.className = 'toast on' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 5200) }
const hhmm = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n))
const ICON = {
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb547" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h6M7 13h10M7 16h7"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb547" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h2M3 9h18"/></svg>',
  price: '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb547" stroke-width="2"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>',
  pump: '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb547" stroke-width="2"><path d="M12 3l3 6 6 .9-4.5 4.3 1 6.1L12 17.3 6.5 20.3l1-6.1L3 9.9 9 9z"/></svg>',
  time: '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb547" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  seal: '<svg viewBox="0 0 24 24" fill="none" stroke="#ff7a6e" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
}

// ---------------------------------------------------------------- the board
let st = null, sol = 0
const mcf = (mc) => (sol ? '$' + fmt(mc * sol) : fmt(mc) + ' SOL')
async function pull() {
  try { const r = await get('codes'); if (!r || !r.armed) throw new Error('relay'); st = r; sol = st.sol || sol; paint() } catch {
    $('liveDot').className = 'off'; $('liveTxt').textContent = 'reconnecting'
    if (!st) { const m = '<div class="empty">Connecting to the relay…</div>'; $('armedList').innerHTML = m; $('firedList').innerHTML = m }
  }
}
function reasonText(f) {
  const r = f.reason || {}
  if (r.headline) return `“${r.headline}” · ${r.src}`
  if (r.price) return `SOL hit $${(+r.price).toFixed(2)}`
  if (r.tx) return `wallet moved · ${String(r.tx).slice(0, 10)}…`
  if (r.graduated) return 'it graduated'
  if (r.mc) return `market cap $${fmt(r.mc)}`
  if (r.time) return 'its time came'
  return ''
}
function paint() {
  $('liveDot').className = st.live ? '' : 'off'; $('liveTxt').textContent = st.live ? 'watching' : 'reconnecting'
  paintRelay()
  $('armedMeta').textContent = st.armed.length ? `${st.armed.length} armed` : ''
  $('armedList').innerHTML = st.armed.length ? st.armed.map((c) => `<div class="card"><div class="hd"><span class="seal">${ICON.seal}</span>
      <div><div class="trg">${esc(c.trigger)}<small>sealed · dev ${esc(c.dev)}${c.buy ? ' · buys ' + c.buy + ' SOL' : ''}</small></div></div>
      <div class="when"><b>${ago(c.armedAt)}</b><span>armed · ${left(c.expires)} left</span></div></div></div>`).join('')
    : '<div class="empty">Nothing armed right now. Arm the first launch.</div>'
  $('firedList').innerHTML = st.fired.length ? st.fired.map((f) => f.expired
    ? `<div class="rw"><span class="t">${hhmm(f.detected)}</span><span class="ph"></span><div><span class="nm">expired unfired</span><div class="ds">${esc(f.trigger)} · dev ${esc(f.dev)}</div></div><div class="why"></div><span></span><span></span></div>`
    : `<a class="rw" href="${f.failed ? '#' : 'https://pump.fun/coin/' + esc(f.mint)}" target="_blank" rel="noopener"><span class="t">${hhmm(f.detected)}</span>${f.image ? `<img src="${esc(f.image)}" alt="">` : '<span class="ph"></span>'}
      <div><span class="tk">$${esc(f.symbol)}</span> <span class="nm">${esc(f.name)}</span><div class="ds">${esc(f.trigger)}</div></div>
      <div class="why">${esc(reasonText(f))}</div><span class="mono ${f.failed ? 'red' : 'up'}">${f.failed ? esc(f.failed) : f.ms != null ? (f.ms / 1000).toFixed(1) + 's to land' : ''}</span><span class="mono dim hm">${f.live ? mcf(f.live.mc) : ''}</span></a>`).join('')
    : '<div class="empty">Nothing has fired yet. The first one shows here with what tripped it.</div>'
}
pull(); setInterval(pull, 5000)

// ---------------------------------------------------------------- wallet and nonce
const W3 = () => import('https://esm.sh/@solana/web3.js@1.98.0?bundle')
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s) }
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const TIPS = ['ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49', 'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh', 'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL', 'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt', 'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY', '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5', '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT', 'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe']
let wallet = null
async function connectWallet() {
  if (wallet) return wallet
  const p = window.phantom?.solana || window.solflare || window.backpack
  if (!p) throw new Error('no Solana wallet found. Install Phantom, Solflare or Backpack.')
  const r = await p.connect(); wallet = { p, pk: (r?.publicKey || p.publicKey).toString() }; return wallet
}
async function confirm(sig) {
  for (let i = 0; i < 40; i++) {
    const r = await rpc('getSignatureStatuses', [[sig]]); const s = r?.value?.[0]
    if (s?.err) throw new Error('the transaction failed on-chain')
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return
    await new Promise((ok) => setTimeout(ok, 1500))
  }
  throw new Error('not confirmed in time, try again')
}
async function ensureNonce(W, seed, note) {
  const owner = new W.PublicKey(wallet.pk), noncePk = await W.PublicKey.createWithSeed(owner, seed, W.SystemProgram.programId)
  let acc = await rpc('getAccountInfo', [noncePk.toBase58(), { encoding: 'base64', commitment: 'confirmed' }])
  if (!acc?.value) {
    note('sign once to create your nonce account (about 0.0015 SOL of rent, yours to reclaim)…')
    const rent = await rpc('getMinimumBalanceForRentExemption', [W.NONCE_ACCOUNT_LENGTH])
    const bh = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value.blockhash
    const t = new W.Transaction({ feePayer: owner, recentBlockhash: bh }).add(...W.SystemProgram.createNonceAccount({ fromPubkey: owner, noncePubkey: noncePk, basePubkey: owner, seed, authorizedPubkey: owner, lamports: rent }).instructions)
    const signed = await wallet.p.signTransaction(t)
    const s = await post('send', { tx: b64(signed.serialize()) }); if (s.error) throw new Error(s.error)
    note('creating the nonce account…'); await confirm(s.signature)
    acc = await rpc('getAccountInfo', [noncePk.toBase58(), { encoding: 'base64', commitment: 'confirmed' }])
  }
  return { noncePk, nonce: W.NonceAccount.fromAccountData(unb64(acc.value.data[0])).nonce }
}
const mark = (id, s, t) => { const i = $(id); i.className = s; i.textContent = s === 'ok' ? '✓' : s === 'no' ? '✕' : '○'; if (t) $(id + 't').textContent = t }

// ---------------------------------------------------------------- arming
const sheet = $('sheet')
;[$('bArm'), $('bArm2')].forEach((b) => (b.onclick = () => sheet.classList.add('on')))
document.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => sheet.classList.remove('on')))
addEventListener('keydown', (e) => { if (e.key === 'Escape') sheet.classList.remove('on') })
let kind = 'news'
$('kinds').querySelectorAll('button').forEach((b) => (b.onclick = () => { kind = b.dataset.k; $('kinds').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); document.querySelectorAll('.tf').forEach((f) => (f.hidden = f.dataset.k !== kind)) }))
function trigger() {
  if (kind === 'news') return { kind, words: $('tWords').value }
  if (kind === 'wallet') return { kind, address: $('tWallet').value.trim() }
  if (kind === 'price') return { kind, dir: $('tDir').value, level: +$('tLevel').value }
  if (kind === 'pump') return { kind, mint: $('tMint').value.trim(), event: $('tEvent').value, level: +$('tMc').value }
  return { kind, at: new Date($('tAt').value).getTime() }
}
let img = null, imgHash = ''
$('fImg').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return
  imgHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer()))).map((x) => x.toString(16).padStart(2, '0')).join('')
  const bmp = await createImageBitmap(f), side = Math.min(bmp.width, bmp.height), size = Math.min(1000, side)
  const cv = document.createElement('canvas'); cv.width = cv.height = size
  cv.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size)
  img = cv.toDataURL('image/webp', 0.9); $('fPrev').src = img; $('fPrev').style.display = 'block'
}
$('fGo').onclick = async () => {
  const b = $('fGo'), note = (t) => ($('fNote').textContent = t)
  if (!wallet) { try { await connectWallet(); mark('kW', 'ok', `dev wallet ${wallet.pk.slice(0, 4)}…${wallet.pk.slice(-4)}`); b.textContent = 'Sign and arm' } catch (e) { toast(String(e.message || e), true) } return }
  const name = $('fName').value.trim(), symbol = $('fSym').value.trim().replace(/^\$+/, '')
  if (!name || !symbol || !img) return toast('name, ticker and a picture, please', true)
  const trig = trigger()
  b.disabled = true
  try {
    const W = await W3(), owner = new W.PublicKey(wallet.pk)
    note('checking for copies…')
    const v = await get('vamp', `name=${encodeURIComponent(name)}&symbol=${encodeURIComponent(symbol)}&img=${imgHash}`)
    if ((v.hits || []).length) { mark('kC', 'no', `$${v.hits[0].symbol} launched ${ago(v.hits[0].at)} ago. no copies`); throw new Error('that ticker or name is taken this hour') }
    if (v.image) { mark('kC', 'no', `that picture belongs to $${v.image.symbol}`); throw new Error('that picture is already in use') }
    mark('kC', 'ok', 'ticker, name and picture are original')
    const { noncePk, nonce } = await ensureNonce(W, 'launchcode', note)
    mark('kN', 'ok', `nonce account ${noncePk.toBase58().slice(0, 4)}…${noncePk.toBase58().slice(-4)}`)
    note('building your launch…')
    const up = await post('upload', { name, symbol, description: $('fDesc').value, image: img, imgHash, twitter: $('fX').value, website: $('fWeb').value })
    if (up.error) throw new Error(up.error)
    const mint = W.Keypair.generate(), buy = Math.max(0, +$('fBuy').value || 0)
    const r = await fetch('https://pumpportal.fun/api/trade-local', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publicKey: wallet.pk, action: 'create', tokenMetadata: { name, symbol, uri: up.uri }, mint: mint.publicKey.toBase58(), denominatedInSol: 'true', amount: buy, slippage: 15, priorityFee: 0.0005, pool: 'pump' }) })
    if (r.status !== 200) throw new Error('could not build the launch (' + r.status + ')')
    const built = W.VersionedTransaction.deserialize(new Uint8Array(await r.arrayBuffer()))
    const luts = await Promise.all(built.message.addressTableLookups.map(async (l) => {
      const a = await rpc('getAccountInfo', [l.accountKey.toBase58(), { encoding: 'base64' }])
      return new W.AddressLookupTableAccount({ key: l.accountKey, state: W.AddressLookupTableAccount.deserialize(unb64(a.value.data[0])) })
    }))
    const msg = W.TransactionMessage.decompile(built.message, { addressLookupTableAccounts: luts })
    msg.instructions.unshift(W.SystemProgram.nonceAdvance({ noncePubkey: noncePk, authorizedPubkey: owner }))
    msg.instructions.push(W.SystemProgram.transfer({ fromPubkey: owner, toPubkey: new W.PublicKey(TIPS[mint.publicKey.toBytes()[0] % 8]), lamports: 500_000 }))
    msg.recentBlockhash = nonce
    const tx = new W.VersionedTransaction(msg.compileToV0Message(luts)); tx.sign([mint])
    note('sign your launch. it is only sent when the trigger hits')
    const signed = await wallet.p.signTransaction(tx)
    mark('kS', 'ok', 'launch signed')
    note('checking it would land…')
    const a = await post('arm', { tx: b64(signed.serialize()), mint: mint.publicKey.toBase58(), name, symbol, desc: $('fDesc').value, image: up.image, uri: up.uri, buy, trigger: trig, hours: +$('fHours').value })
    if (a.error) throw new Error(a.error)
    try { localStorage.setItem('lc.mine.' + a.id, JSON.stringify({ name, symbol, mint: a.mint })) } catch {}
    toast(`$${symbol} is armed. It fires when: ${a.trigger}.`); sheet.classList.remove('on'); pull()
  } catch (e) { toast(String(e.message || e).slice(0, 220), true) }
  note('Two signatures the first time (the nonce account, then the launch), one after that.'); b.disabled = false
}

// ---------------------------------------------------------------- the relay, live: what it sees on the chain right now
const fmtN = (n) => Number(n).toLocaleString('en-US')
let shownSlot = 0
function paintRelay() {
  const ch = st.chain || {}, ok = st.live && ch.slot && Date.now() - ch.slotAt < 20_000
  document.querySelector('.rh .pulse').className = 'pulse' + (ok ? '' : ' off')
  $('rState').textContent = ok ? 'live on Solana mainnet, reading every pump.fun launch' : 'reconnecting to Solana…'
  $('rLaunch').textContent = fmtN(ch.launches1h || 0)
  $('rNews').textContent = (st.feeds || []).length; $('rArmed').textContent = st.armed.length
  $('rSol').textContent = sol ? '$' + sol.toFixed(2) : '–'
  const n = (st.news || [])[0]
  if (n) { $('rHead').textContent = `“${n.title}” · ${n.src}`; $('rFeed').href = n.link || '#' }
}
setInterval(() => {
  if (!st?.chain) return
  const ch = st.chain
  // the slot advances about every 400 ms between polls; the figure catches up with each poll
  const est = ch.slot ? ch.slot + Math.floor((Date.now() - ch.slotAt) / 400) : 0
  if (est && est !== shownSlot) { const b = $('rSlot'); b.textContent = fmtN(est); b.classList.add('tick'); setTimeout(() => b.classList.remove('tick'), 180); shownSlot = est }
  $('rSlotAgo').textContent = ch.slotAt ? `last block seen ${ago(ch.slotAt)} ago` : ''
  $('rNewest').textContent = ch.newest ? `newest $${ch.newest.symbol} · ${ago(ch.newest.at)} ago` : ''
  $('rNewsAgo').textContent = st.newsAt ? `checked ${ago(st.newsAt)} ago · ${fmtN(st.read || 0)} read` : ''
  $('rSolAgo').textContent = ch.solAt ? `updated ${ago(ch.solAt)} ago` : ''
}, 200)

// ---------------------------------------------------------------- the hero: triggers on hairlines into the switch; one trips, the launch goes to pump.fun
const stage = $('stage'), net = $('net'), nctx = net.getContext('2d'), obj = $('obj')
const SW = 1120, SH = 360, CEN = [560, 175]
const TRIG = [['news', 330, 70, 'a headline'], ['wallet', 205, 190, 'a wallet moves'], ['price', 360, 300, 'a price'], ['pump', 840, 62, 'a coin graduates'], ['time', 975, 300, 'a time']]
const PUMP = [930, 182]
const tiles = TRIG.map(([k, x, y, lab]) => { const el = document.createElement('div'); el.className = 'tile'; Object.assign(el.style, { left: x + 'px', top: y + 'px' }); el.innerHTML = ICON[k] + `<span class="lab">${lab}</span>`; stage.appendChild(el); return el })
const pumpTile = document.createElement('div'); pumpTile.className = 'tile pump'; Object.assign(pumpTile.style, { left: PUMP[0] + 'px', top: PUMP[1] + 'px' }); pumpTile.innerHTML = '<i></i><span class="lab">pump.fun</span>'; stage.appendChild(pumpTile)
function fitStage() {
  const s = Math.min(1, (innerWidth - 16) / SW); stage.style.transform = `scale(${s})`; stage.style.marginBottom = `${-(1 - s) * SH}px`
  const d = devicePixelRatio || 1; net.width = SW * d; net.height = SH * d; nctx.setTransform(d, 0, 0, d, 0, 0)
}
addEventListener('resize', fitStage); fitStage()
const bez = (p0, c1, c2, p1, t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1]] }
const curve = (a, b) => { const mx = (a[0] + b[0]) / 2; return [a, [mx, a[1]], [mx, b[1]], b] }
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - (1 - x) ** 3)
const PERIOD = 3800
let lastCyc = -1
function draw(now) {
  nctx.clearRect(0, 0, SW, SH)
  const cyc = Math.floor(now / PERIOD), t = now % PERIOD, hot = [0, 2, 3, 1, 4][cyc % 5]
  const glow = (x, y, r, col) => { const g = nctx.createRadialGradient(x, y, 0, x, y, r * 5); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); nctx.fillStyle = g; nctx.beginPath(); nctx.arc(x, y, r * 5, 0, 7); nctx.fill(); nctx.fillStyle = '#fff'; nctx.beginPath(); nctx.arc(x, y, r * 0.55, 0, 7); nctx.fill() }
  const line = (c, col, w) => { nctx.strokeStyle = col; nctx.lineWidth = w; nctx.beginPath(); nctx.moveTo(...c[0]); nctx.bezierCurveTo(...c[1], ...c[2], ...c[3]); nctx.stroke() }
  TRIG.forEach(([k, x, y], i) => {
    const from = [x + (x < CEN[0] ? 27 : -27), y], c = curve(from, [CEN[0] + (x < CEN[0] ? -60 : 60), CEN[1] + (y - CEN[1]) * 0.15]), on = i === hot
    line(c, on ? 'rgba(255,181,71,.45)' : 'rgba(255,255,255,.12)', 1)
    if (on && t < 1000) glow(...bez(...c, ease(t / 1000)), 2.2, 'rgba(255,181,71,.7)')
    tiles[i].classList.toggle('hot', on && t < 1500)
  })
  const o = curve([CEN[0] + 70, CEN[1] + 6], [PUMP[0] - 27, PUMP[1]]), firing = t > 1000 && t < 2600
  line(o, firing ? 'rgba(74,222,128,.7)' : 'rgba(255,255,255,.12)', firing ? 1.6 : 1)
  if (t >= 1000 && t < 1500) glow(...bez(...o, ease((t - 1000) / 500)), 2.8, 'rgba(74,222,128,.8)')
  if (cyc !== lastCyc && t > 1000) { lastCyc = cyc; obj.classList.remove('hit'); void obj.offsetWidth; obj.classList.add('hit') }
  pumpTile.classList.toggle('fire', firing)
  requestAnimationFrame(draw)
}
requestAnimationFrame(draw)
