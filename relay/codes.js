// LAUNCHCODE: armed launches. A creator signs their coin's pump.fun launch now, against a durable nonce their wallet
// owns, and picks a trigger: words in a headline, a wallet moving, a price level, a pump.fun coin graduating or
// reaching a market cap, or a time. The relay watches and broadcasts the signed launch the moment the trigger hits.
// The coin stays sealed (name, ticker, picture hidden) until it fires, so nobody can launch it first.
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
function parseTx(b64) {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  let o = 0
  const cu16 = (buf, at) => { let v = 0, s = 0, i = at; for (;;) { const b = buf[i++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) return [v, i]; s += 7 } }
  let nsig; [nsig, o] = cu16(raw, o)
  const sigs = []; for (let i = 0; i < nsig; i++) { sigs.push(raw.slice(o, o + 64)); o += 64 }
  const msg = raw.slice(o)
  let m = (msg[0] & 0x80) ? 1 : 0; m += 3
  let nk; [nk, m] = cu16(msg, m)
  const keys = []; for (let i = 0; i < nk; i++) { keys.push(b58(msg.slice(m, m + 32))); m += 32 }
  return { sigs, msg, keys, sig: b58(sigs[0] || []) }
}

const JITO = ["https://mainnet.block-engine.jito.wtf", "https://amsterdam.mainnet.block-engine.jito.wtf", "https://frankfurt.mainnet.block-engine.jito.wtf", "https://ny.mainnet.block-engine.jito.wtf", "https://tokyo.mainnet.block-engine.jito.wtf"]
export const FEEDS = [
  ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"], ["Cointelegraph", "https://cointelegraph.com/rss"], ["Decrypt", "https://decrypt.co/feed"],
  ["The Block", "https://www.theblock.co/rss.xml"], ["BBC World", "https://feeds.bbci.co.uk/news/world/rss.xml"], ["BBC Business", "https://feeds.bbci.co.uk/news/business/rss.xml"],
  ["BBC Tech", "https://feeds.bbci.co.uk/news/technology/rss.xml"],
]
const MAX_ARMED = 120, MAX_AHEAD = 72 * 3600_000, KINDS = ["news", "wallet", "price", "pump", "time"]
const isKey = (x) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x || "")
const decode = (s) => String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, "").trim()
const words = (s) => decode(s).toLowerCase().split(/[^a-z0-9$]+/).filter(Boolean)

export function parseRss(xml, src) {
  const out = []
  for (const it of String(xml).split(/<item[\s>]/).slice(1)) {
    const title = decode((it.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1])
    const link = decode((it.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1])
    const pub = Date.parse(decode((it.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/) || [])[1])) || 0
    if (title) out.push({ title: title.slice(0, 220), link: link.slice(0, 400), src, pub })
  }
  return out
}

export function createCodes({ feed, store, rpc, sendRaw, getSol }) {
  const armed = new Map()            // id -> code
  let fired = [], news = [], busy = false, feedTurn = 0
  const seen = new Set()             // headlines already seen (title|src)
  const short = (w) => w.slice(0, 4) + "…" + w.slice(-4)
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))

  function describe(t) {
    if (t.kind === "news") return `a headline with “${t.words.join(" ")}”`
    if (t.kind === "wallet") return `wallet ${short(t.address)} moves`
    if (t.kind === "price") return `SOL ${t.dir === "above" ? "above" : "below"} $${t.level}`
    if (t.kind === "pump") return t.event === "graduates" ? `$${t.sym || short(t.mint)} graduates` : `$${t.sym || short(t.mint)} hits $${Math.round(t.level).toLocaleString("en-US")} MC`
    return `at ${new Date(t.at).toISOString().slice(11, 16)} UTC`
  }
  const sealed = (c) => ({ id: c.id, trigger: describe(c.trigger), kind: c.trigger.kind, dev: short(c.wallet), armedAt: c.armedAt, expires: c.expires, buy: c.buy })

  function normTrigger(t, now) {
    const k = String(t?.kind || "")
    if (!KINDS.includes(k)) throw new Error("pick a trigger")
    if (k === "news") {
      const w = words(t.words).slice(0, 5)
      if (!w.length || w.join("").length < 3) throw new Error("give the headline words to watch for")
      return { kind: k, words: w }
    }
    if (k === "wallet") { if (!isKey(t.address)) throw new Error("that's not a Solana address"); return { kind: k, address: t.address } }
    if (k === "price") { const level = +t.level; if (!(level > 0)) throw new Error("set a SOL price"); return { kind: k, dir: t.dir === "below" ? "below" : "above", level } }
    if (k === "pump") {
      if (!isKey(t.mint)) throw new Error("paste the pump.fun coin's address")
      const ev = t.event === "mc" ? "mc" : "graduates", level = +t.level
      if (ev === "mc" && !(level > 0)) throw new Error("set the market cap in dollars")
      return { kind: k, mint: t.mint, event: ev, level: ev === "mc" ? level : 0, sym: String(t.sym || "").replace(/[^\w$]/g, "").slice(0, 12) }
    }
    const at = +t.at
    if (!(at > now + 60_000 && at < now + MAX_AHEAD)) throw new Error("pick a time in the next 72 hours")
    return { kind: "time", at }
  }

  async function arm(b) {
    const s = (x, n) => String(x || "").trim().slice(0, n)
    const name = s(b.name, 32), symbol = s(b.symbol, 10).replace(/^\$+/, "")
    if (!name || !symbol) throw new Error("name and ticker are required")
    if (armed.size >= MAX_ARMED) throw new Error("too many codes armed. try again soon")
    const now = Date.now(), trigger = normTrigger(b.trigger || {}, now)
    const hours = Math.max(1, Math.min(72, +b.hours || 24))
    const tx = parseTx(String(b.tx || ""))
    const wallet = tx.keys[0], mint = String(b.mint || "")
    if (!tx.keys.includes(mint)) throw new Error("the transaction doesn't create that coin")
    if (!(await ed25519(b58decode(wallet), tx.msg, tx.sigs[0]))) throw new Error("the launch isn't signed by its creator")
    for (const x of armed.values()) if (x.wallet === wallet) throw new Error("this wallet already has a code armed")
    const hits = feed.vamp(name, symbol)
    if (hits.length) throw new Error(`$${hits[0].symbol} launched on pump.fun ${Math.round((now - hits[0].at) / 60000)} min ago. no copies`)
    const sim = await rpc("simulateTransaction", [b.tx, { encoding: "base64", sigVerify: true, replaceRecentBlockhash: false, commitment: "processed" }])
    if (sim?.value?.err) throw new Error("the signed launch wouldn't land: " + JSON.stringify(sim.value.err).slice(0, 120))
    // wallet triggers start from that wallet's latest transaction, so only a new one fires
    if (trigger.kind === "wallet") trigger.after = ((await rpc("getSignaturesForAddress", [trigger.address, { limit: 1 }]).catch(() => [])) || [])[0]?.signature || ""
    const id = mint.slice(0, 10)
    const c = { id, armedAt: now, expires: trigger.kind === "time" ? trigger.at + 600_000 : now + hours * 3600_000, trigger, name, symbol, desc: s(b.desc, 280), image: s(b.image, 300), mint, wallet, tx: b.tx, sig: tx.sig, buy: Math.max(0, +b.buy || 0) }
    armed.set(id, c)
    await save()
    return { ...sealed(c), mint, name, symbol }
  }

  // ---------------------------------------------------------------- firing
  const jito = (b64) => Promise.allSettled(JITO.map((u) => fetch(u + "/api/v1/transactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [b64, { encoding: "base64" }] }) })))
  async function fire(c, reason) {
    armed.delete(c.id)
    const detected = Date.now(), out = { id: c.id, name: c.name, symbol: c.symbol, image: c.image, mint: c.mint, dev: short(c.wallet), trigger: describe(c.trigger), kind: c.trigger.kind, reason, detected, sig: c.sig }
    try {
      jito(c.tx)
      await sendRaw(c.tx)
      for (let i = 0; i < 40; i++) {
        const st = (await rpc("getSignatureStatuses", [[c.sig]]).catch(() => null))?.value?.[0]
        if (st && !st.err) { out.landed = Date.now(); out.slot = st.slot; out.ms = out.landed - detected; break }
        if (st?.err) { out.failed = "the launch failed on-chain"; break }
        await sleep(300)
      }
      if (!out.landed && !out.failed) out.failed = "didn't confirm"
    } catch (e) { out.failed = String(e.message || e).slice(0, 100) }
    if (!out.failed) feed.pinned?.add?.(c.mint)
    fired.unshift(out); if (fired.length > 200) fired.length = 200
    await save()
  }

  // ---------------------------------------------------------------- watching
  async function pollNews() {
    const want = new Set(); for (const c of armed.values()) if (c.trigger.kind === "news") want.add(c.trigger.words.join(" "))
    // three of the fixed feeds a tick (round robin), plus Google News for one armed phrase
    const batch = [0, 1, 2].map((i) => FEEDS[(feedTurn + i) % FEEDS.length]); feedTurn = (feedTurn + 3) % FEEDS.length
    const phrases = [...want]; if (phrases.length) { const q = phrases[(feedTurn / 3 | 0) % phrases.length]; batch.push(["Google News", `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`]) }
    const got = await Promise.all(batch.map(([src, url]) => fetch(url, { headers: { "user-agent": "Mozilla/5.0 (launchcode relay)" } }).then((r) => r.text()).then((x) => parseRss(x, src)).catch(() => [])))
    const fresh = []
    for (const it of got.flat()) {
      const key = it.title + "|" + it.src; if (seen.has(key)) continue
      seen.add(key); if (seen.size > 20000) seen.delete(seen.values().next().value)
      it.seenAt = Date.now(); fresh.push(it)
      if (it.src !== "Google News") { news.unshift(it); if (news.length > 60) news.length = 60 }
    }
    for (const it of fresh) {
      if (Date.now() - (it.pub || Date.now()) > 30 * 60_000) continue       // only new news
      const w = new Set(words(it.title))
      for (const c of [...armed.values()]) if (c.trigger.kind === "news" && it.pub >= c.armedAt - 60_000 && c.trigger.words.every((x) => w.has(x))) await fire(c, { headline: it.title, link: it.link, src: it.src })
    }
  }
  async function pollWallets() {
    for (const c of [...armed.values()].filter((c) => c.trigger.kind === "wallet").slice(0, 20)) {
      const sigs = (await rpc("getSignaturesForAddress", [c.trigger.address, { limit: 3 }]).catch(() => null)) || []
      const top = sigs[0]?.signature
      if (top && top !== c.trigger.after && (sigs[0].blockTime || 0) * 1000 >= c.armedAt - 5000) await fire(c, { tx: top, wallet: c.trigger.address })
    }
  }
  async function pollPrices() {
    const sol = getSol()
    for (const c of [...armed.values()]) {
      const t = c.trigger
      if (t.kind === "price" && sol > 0 && (t.dir === "above" ? sol >= t.level : sol <= t.level)) await fire(c, { price: sol })
      if (t.kind === "pump") {
        const coin = feed.coins.get(t.mint)
        if (coin && t.event === "graduates" && coin.done) await fire(c, { graduated: t.mint })
        if (coin && t.event === "mc" && sol > 0 && (coin.vSol / coin.vTok) * 1e9 * sol >= t.level) await fire(c, { mc: Math.round((coin.vSol / coin.vTok) * 1e9 * sol) })
      }
      if (t.kind === "time" && Date.now() >= t.at) await fire(c, { time: t.at })
    }
  }
  let ticks = 0
  async function tick() {
    if (busy) return; busy = true
    try {
      for (const c of [...armed.values()]) if (Date.now() > c.expires) { armed.delete(c.id); fired.unshift({ id: c.id, dev: short(c.wallet), trigger: describe(c.trigger), kind: c.trigger.kind, expired: true, detected: Date.now() }) }
      await pollPrices()
      if (ticks % 2 === 0) await pollWallets()
      if (ticks % 3 === 0 || [...armed.values()].some((c) => c.trigger.kind === "news")) await pollNews()
      ticks++
    } catch (e) { console.log("codes tick", String(e)) } finally { busy = false }
  }
  const nextWake = () => { let t = Infinity; for (const c of armed.values()) t = Math.min(t, c.trigger.kind === "time" ? c.trigger.at : Date.now() + 15_000); return t }

  async function save() { await store.put("lc:armed", [...armed.values()]); await store.put("lc:fired", fired) }
  async function restore() { for (const c of (await store.get("lc:armed")) || []) armed.set(c.id, c); fired = (await store.get("lc:fired")) || [] }
  function state() {
    const live = (m) => { const c = feed.coins.get(m); return c ? { mc: +((c.vSol / c.vTok) * 1e9).toFixed(2), buyers: c.buyers.size, prog: c.rTok0 ? +((1 - c.rTok / c.rTok0) * 100).toFixed(1) : 0, done: c.done } : null }
    const grads = []; for (const c of feed.coins.values()) if (c.done) grads.push({ symbol: c.symbol, name: c.name, img: c.meta?.image || null, at: c.at })
    return {
      now: Date.now(), armed: [...armed.values()].sort((a, b) => b.armedAt - a.armedAt).map(sealed),
      fired: fired.slice(0, 60).map((f) => ({ ...f, live: f.mint && !f.failed ? live(f.mint) : null })),
      news: news.slice().sort((a, b) => (b.pub || 0) - (a.pub || 0)).slice(0, 12).map((n) => ({ title: n.title, src: n.src, link: n.link, pub: n.pub })), grads: grads.slice(-6).reverse(),
      feeds: FEEDS.map((f) => f[0]),
    }
  }
  return { arm, tick, state, save, restore, nextWake, describe, parseRss }
}
