// Same-origin proxy to the relay (Vercel edge). Reads are cached a few seconds at the CDN so the relay's request
// budget holds however many people are watching; writes (schedule, seat, upload, send, rpc) pass straight through.
import { RELAY_BASE } from './_relay.js'
export const config = { runtime: 'edge' }
const TTL = { codes: 4, board: 8, vamp: 3, coin: 8 }
const POSTS = new Set(['arm', 'upload', 'send', 'rpc', 'launched'])
const J = { 'content-type': 'application/json' }
export default async function handler(req) {
  const u = new URL(req.url), path = u.searchParams.get('path')
  if (req.method === 'POST') {
    if (!POSTS.has(path)) return new Response('{"error":"unknown"}', { status: 404, headers: J })
    const r = await fetch(`${RELAY_BASE}/v1/${path}`, { method: 'POST', headers: J, body: await req.text() }).catch(() => null)
    if (!r) return new Response('{"error":"the relay is offline, try again in a minute"}', { status: 502, headers: J })
    return new Response(r.body, { status: r.status, headers: { ...J, 'cache-control': 'no-store' } })
  }
  if (!TTL[path]) return new Response('{"error":"unknown"}', { status: 404, headers: J })
  u.searchParams.delete('path')
  const r = await fetch(`${RELAY_BASE}/v1/${path}?${u.searchParams}`, { cache: 'no-store' }).catch(() => null)
  if (!r || !r.ok) return new Response('{"error":"relay offline"}', { status: 502, headers: { ...J, 'cache-control': 'no-store' } })
  return new Response(r.body, { status: r.status, headers: { ...J, 'cache-control': `public, s-maxage=${TTL[path]}, stale-while-revalidate=${TTL[path] * 3}` } })
}
