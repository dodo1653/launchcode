// OUTSNIPE: the public launch bundle. A creator signs their coin's pump.fun launch now, against a durable nonce
// their wallet owns, and schedules it. Anyone can take one of four seats: they sign a buy of the coin (it doesn't
// exist yet; every account it needs is known in advance) against their own durable nonce. At launch time the relay
// sends one Jito bundle: the launch, then the four seats, in that order, all or nothing. They land in the coin's
// first block before anyone else can even see it. If the bundle can't land, the launch goes alone and the seats
// follow straight after.
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
export function b58(bytes) { let n = 0n; for (const x of bytes) n = n * 256n + BigInt(x); let s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n } for (const x of bytes) { if (x) break; s = "1" + s } return s }
export function b58decode(s) {
  let n = 0n
  for (const ch of s) { const i = B58.indexOf(ch); if (i < 0) throw new Error("b58"); n = n * 58n + BigInt(i) }
  const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n }
  for (const ch of s) { if (ch !== "1") break; out.unshift(0) }
  return new Uint8Array(out)
}
async function ed25519(pub, msg, sig) {
  try { const k = await crypto.subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]); return await crypto.subtle.verify({ name: "Ed25519" }, k, sig, msg) } catch { return false }
}

export const SEATS = 4, MIN_SEAT = 0.05, MAX_SEAT = 1, LAMPORTS = 1e9
const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", SYS = "11111111111111111111111111111111"
const CB = "ComputeBudget111111111111111111111111111111", ATA = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
const BUY_EXACT = [225, 247, 80, 30, 213, 179, 132, 136]   // pump buy_exact_quote_in_v3
export const TIPS = ["ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49", "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh", "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL", "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt", "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY", "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5", "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT", "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe"]
const JITO = ["https://mainnet.block-engine.jito.wtf", "https://amsterdam.mainnet.block-engine.jito.wtf", "https://frankfurt.mainnet.block-engine.jito.wtf", "https://ny.mainnet.block-engine.jito.wtf", "https://tokyo.mainnet.block-engine.jito.wtf", "https://slc.mainnet.block-engine.jito.wtf"]
const SLOT_MS = 15 * 60_000, MAX_AHEAD = 24 * 3600_000, MAX_PENDING = 80

// a serialized transaction: signatures, account keys, blockhash, instructions (with lookup tables only as indexes)
export function parseTx(b64) {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  let o = 0
  const cu16 = (buf, at) => { let v = 0, s = 0, i = at; for (;;) { const b = buf[i++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) return [v, i]; s += 7 } }
  let nsig; [nsig, o] = cu16(raw, o)
  const sigs = []; for (let i = 0; i < nsig; i++) { sigs.push(raw.slice(o, o + 64)); o += 64 }
  const msg = raw.slice(o)
  let m = 0
  const versioned = !!(msg[0] & 0x80); if (versioned) m = 1
  const header = [msg[m], msg[m + 1], msg[m + 2]]; m += 3
  let nk; [nk, m] = cu16(msg, m)
  const keys = []; for (let i = 0; i < nk; i++) { keys.push(b58(msg.slice(m, m + 32))); m += 32 }
  const blockhash = b58(msg.slice(m, m + 32)); m += 32
  let ni; [ni, m] = cu16(msg, m)
  const ixs = []
  for (let i = 0; i < ni; i++) {
    const prog = msg[m++]; let na; [na, m] = cu16(msg, m)
    const accts = [...msg.slice(m, m + na)]; m += na
    let nd; [nd, m] = cu16(msg, m)
    ixs.push({ prog, accts, data: msg.slice(m, m + nd) }); m += nd
  }
  let luts = 0; if (versioned) [luts] = cu16(msg, m)
  return { sigs, msg, keys, header, blockhash, ixs, luts, raw, sig: b58(sigs[0] || []), size: raw.length }
}
const u64 = (d, at) => { let v = 0n; for (let i = 7; i >= 0; i--) v = v * 256n + BigInt(d[at + i]); return v }
const u32 = (d, at) => d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24)

// a seat: nonce advance first, then only compute budget, the buyer's token account, one pump buy of this coin, a tip
export function readSeat(tx, mint) {
  if (tx.luts) throw new Error("a seat can't use lookup tables")
  const k = (i) => tx.keys[i], payer = tx.keys[0]
  const [first, ...rest] = tx.ixs
  if (!first || k(first.prog) !== SYS || u32(first.data, 0) !== 4 || k(first.accts[2]) !== payer) throw new Error("a seat must start by advancing its durable nonce")
  let buy = null, tip = 0
  for (const ix of rest) {
    const p = k(ix.prog)
    if (p === CB || p === ATA) continue
    if (p === SYS && u32(ix.data, 0) === 2 && TIPS.includes(k(ix.accts[1]))) { tip += Number(u64(ix.data, 4)); continue }
    if (p === PUMP && BUY_EXACT.every((b, i) => ix.data[i] === b) && !buy) { buy = ix; continue }
    throw new Error("a seat can only buy the coin")
  }
  if (!buy) throw new Error("no buy in that seat")
  if (k(buy.accts[1]) !== mint) throw new Error("that seat buys a different coin")
  if (k(buy.accts[8]) !== payer) throw new Error("that seat buys for someone else")
  if (tip > 1_000_000) throw new Error("tip too large")
  return { wallet: payer, nonce: k(first.accts[0]), spend: Number(u64(buy.data, 8)), minOut: Number(u64(buy.data, 16)), tip }
}
// a nonce account's authority and stored nonce (system nonce account layout, 80 bytes)
function nonceOf(acc) {
  if (!acc || acc.owner !== SYS) return null
  const d = Uint8Array.from(atob(acc.data[0]), (c) => c.charCodeAt(0)); if (d.length < 72) return null
  return { authority: b58(d.slice(8, 40)), nonce: b58(d.slice(40, 72)) }
}

export function createLaunches({ feed, store, rpc, sendRaw }) {
  const pending = new Map()   // id -> launch
  let done = []               // launched (or failed) launches, newest first
  let busy = false
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
  const short = (w) => w.slice(0, 4) + "…" + w.slice(-4)
  const view = (L) => ({
    id: L.id, name: L.name, symbol: L.symbol, desc: L.desc, image: L.image, mint: L.mint, dev: short(L.wallet), at: L.at, full: L.full, buy: L.buy, created: L.created,
    seats: L.seats.map((s) => ({ wallet: short(s.wallet), sol: s.spend / LAMPORTS, at: s.added })),
    ahead: (L.buy || 0) + L.seats.reduce((a, s) => a + s.spend / LAMPORTS, 0),
  })

  async function submit(b) {
    const s = (x, n) => String(x || "").trim().slice(0, n)
    const name = s(b.name, 32), symbol = s(b.symbol, 10).replace(/^\$+/, "")
    if (!name || !symbol) throw new Error("name and ticker are required")
    if (pending.size >= MAX_PENDING) throw new Error("too many launches waiting. try again soon")
    const at = +b.at
    if (!(at % SLOT_MS === 0 && at > Date.now() + 60_000 && at <= Date.now() + MAX_AHEAD)) throw new Error("pick a launch time in the next 24 hours")
    const tx = parseTx(String(b.tx || ""))
    const wallet = tx.keys[0], mint = String(b.mint || "")
    if (!tx.keys.includes(mint)) throw new Error("the transaction doesn't create that coin")
    if (!(await ed25519(b58decode(wallet), tx.msg, tx.sigs[0]))) throw new Error("the launch isn't signed by its creator")
    for (const x of pending.values()) {
      if (x.wallet === wallet) throw new Error("this wallet already has a launch waiting")
      if (x.symbol.toLowerCase() === symbol.toLowerCase() || x.name.toLowerCase() === name.toLowerCase()) throw new Error(`$${x.symbol} is already waiting to launch here. no copies`)
    }
    const hits = feed.vamp(name, symbol)
    if (hits.length) throw new Error(`$${hits[0].symbol} launched on pump.fun ${Math.round((Date.now() - hits[0].at) / 60000)} min ago. no copies`)
    const sim = await rpc("simulateTransaction", [b.tx, { encoding: "base64", sigVerify: true, replaceRecentBlockhash: false, commitment: "processed" }])
    if (sim?.value?.err) throw new Error("the signed launch wouldn't land: " + JSON.stringify(sim.value.err).slice(0, 120))
    const id = mint.slice(0, 10)
    const L = { id, created: Date.now(), at, full: !!b.full, name, symbol, desc: s(b.desc, 280), image: s(b.image, 300), uri: s(b.uri, 300), mint, wallet, tx: b.tx, sig: tx.sig, buy: Math.max(0, +b.buy || 0), seats: [] }
    pending.set(id, L)
    await save()
    return view(L)
  }

  async function seat(b) {
    const L = pending.get(String(b.id || ""))
    if (!L) throw new Error("that launch isn't open")
    if (L.seats.length >= SEATS) throw new Error("all four seats are taken")
    if (L.at - Date.now() < 20_000 && !L.firing) throw new Error("seats close 20 seconds before launch")
    if (L.firing) throw new Error("it's launching")
    const tx = parseTx(String(b.tx || ""))
    const st = readSeat(tx, L.mint)
    if (!(await ed25519(b58decode(st.wallet), tx.msg, tx.sigs[0]))) throw new Error("the seat isn't signed by its buyer")
    if (st.wallet === L.wallet) throw new Error("the creator buys in the launch itself")
    for (const x of pending.values()) for (const y of x.seats) if (y.wallet === st.wallet) throw new Error(`this wallet already holds a seat on $${x.symbol}`)
    if (st.spend < MIN_SEAT * LAMPORTS || st.spend > MAX_SEAT * LAMPORTS) throw new Error(`a seat is ${MIN_SEAT} to ${MAX_SEAT} SOL`)
    const [acc, bal] = await Promise.all([rpc("getAccountInfo", [st.nonce, { encoding: "base64", commitment: "confirmed" }]), rpc("getBalance", [st.wallet, { commitment: "confirmed" }])])
    const n = nonceOf(acc?.value)
    if (!n || n.authority !== st.wallet || n.nonce !== tx.blockhash) throw new Error("the seat's nonce doesn't match its nonce account")
    if ((bal?.value || 0) < st.spend + 0.006 * LAMPORTS) throw new Error("not enough SOL in that wallet for the seat")
    L.seats.push({ wallet: st.wallet, nonce: st.nonce, spend: st.spend, minOut: st.minOut, tx: b.tx, sig: tx.sig, blockhash: tx.blockhash, added: Date.now() })
    await save()
    return view(L)
  }

  // ---------------------------------------------------------------- launch time
  const jitoSend = (txs) => Promise.allSettled(JITO.map((u) => fetch(u + "/api/v1/bundles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendBundle", params: [txs, { encoding: "base64" }] }) }).then((r) => r.json())))
  async function statuses(sigs) { const r = await rpc("getSignatureStatuses", [sigs, { searchTransactionHistory: false }]).catch(() => null); return r?.value || sigs.map(() => null) }
  const landed = (s) => s && !s.err && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized" || s.confirmationStatus === "processed")

  async function fire(L) {
    L.firing = true
    const out = { id: L.id, name: L.name, symbol: L.symbol, image: L.image, mint: L.mint, wallet: L.wallet, buy: L.buy, at: Date.now(), sig: L.sig, seats: [] }
    try {
      if (feed.vamp(L.name, L.symbol).length) { out.failed = "a copy launched on pump.fun first"; return out }
      // seats still good: their nonce unchanged, enough SOL left
      const seats = []
      if (L.seats.length) {
        const accs = await rpc("getMultipleAccounts", [L.seats.map((s) => s.nonce), { encoding: "base64", commitment: "confirmed" }]).catch(() => null)
        for (let i = 0; i < L.seats.length; i++) {
          const s = L.seats[i], n = nonceOf(accs?.value?.[i])
          const bal = await rpc("getBalance", [s.wallet, { commitment: "confirmed" }]).catch(() => null)
          if (n && n.nonce === s.blockhash && (bal?.value || 0) >= s.spend + 0.004 * LAMPORTS) seats.push(s)
          else out.seats.push({ wallet: short(s.wallet), sol: s.spend / LAMPORTS, dropped: true })
        }
      }
      // 1. the bundle: launch first, then the seats, all in one block or not at all
      const bundle = [L.tx, ...seats.map((s) => s.tx)]
      let sl = null
      for (let t = 0; t < 16 && !sl; t++) {
        if (t % 2 === 0) await jitoSend(bundle)
        await sleep(500)
        const [c] = await statuses([L.sig]); if (landed(c)) sl = c
      }
      if (sl) {
        out.slot = sl.slot; out.bundled = true
        await sleep(800)
        const st = await statuses(seats.map((s) => s.sig))
        seats.forEach((s, i) => out.seats.push({ wallet: short(s.wallet), sol: s.spend / LAMPORTS, sig: s.sig, slot: st[i]?.slot ?? sl.slot, block0: true }))
        return out
      }
      // 2. the bundle didn't land: the launch goes alone, the seats straight after
      try { await sendRaw(L.tx) } catch (e) { out.failed = "the launch couldn't land: " + String(e.message || e).slice(0, 80); return out }
      for (let t = 0; t < 30 && !sl; t++) { await sleep(400); const [c] = await statuses([L.sig]); if (landed(c)) sl = c }
      if (!sl) { out.failed = "the launch didn't confirm"; return out }
      out.slot = sl.slot; out.bundled = false
      await Promise.allSettled(seats.map((s) => rpc("sendTransaction", [s.tx, { encoding: "base64", skipPreflight: true, maxRetries: 5 }])))
      await sleep(2500)
      const st = await statuses(seats.map((s) => s.sig))
      seats.forEach((s, i) => out.seats.push({ wallet: short(s.wallet), sol: s.spend / LAMPORTS, sig: s.sig, slot: st[i]?.slot ?? null, block0: st[i]?.slot === sl.slot, failed: st[i]?.err ? "failed" : undefined }))
      return out
    } finally { L.firing = false }
  }

  async function tick() {
    if (busy) return; busy = true
    try {
      const due = [...pending.values()].filter((L) => Date.now() >= L.at || (L.full && L.seats.length >= SEATS)).sort((a, b) => a.at - b.at)
      for (const L of due) {
        const r = await fire(L).catch((e) => ({ id: L.id, name: L.name, symbol: L.symbol, image: L.image, mint: L.mint, at: Date.now(), failed: String(e.message || e).slice(0, 80), seats: [] }))
        pending.delete(L.id)
        if (!r.failed) feed.pinned?.add?.(L.mint)
        done.unshift(r); if (done.length > 200) done.length = 200
        await save()
      }
    } finally { busy = false }
  }
  const nextWake = () => { let t = Infinity; for (const L of pending.values()) t = Math.min(t, L.full && L.seats.length >= SEATS ? Date.now() : L.at); return t }

  async function save() { await store.put("os:pending", [...pending.values()].map((L) => ({ ...L, firing: false }))); await store.put("os:done", done) }
  async function restore() {
    for (const L of (await store.get("os:pending")) || []) pending.set(L.id, L)
    done = (await store.get("os:done")) || []
  }

  function state() {
    const live = (m) => { const c = feed.coins.get(m); return c ? { mc: +(c.vTok > 0 ? (c.vSol / c.vTok) * 1e9 : 0).toFixed(2), buyers: c.buyers.size, prog: c.rTok0 ? +((1 - c.rTok / c.rTok0) * 100).toFixed(1) : 0, done: c.done, peak: c.peak || 0 } : null }
    return {
      now: Date.now(), seats: SEATS, minSeat: MIN_SEAT, maxSeat: MAX_SEAT,
      boarding: [...pending.values()].sort((a, b) => a.at - b.at).map(view),
      launched: done.slice(0, 60).map((r) => ({ ...r, live: r.mint && !r.failed ? live(r.mint) : null })),
    }
  }
  return { submit, seat, tick, state, save, restore, nextWake }
}
