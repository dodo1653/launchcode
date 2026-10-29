# LAUNCHCODE

**Armed launches for pump.fun, with public seats in block zero.** A creator arms a pre-signed pump.fun launch for a time; four buyers take seats with buys of the coin signed before it exists. At launch time the launch and the seats go out as one Jito bundle, in that order, all or nothing, so the seats land in the block the coin is created, before any sniper bot can see it.

## How it works
- The creator's wallet signs the pump.fun launch (PumpPortal `trade-local`, `create`) against a **durable nonce** it owns (seed `launchcode`), plus a 0.0005 SOL Jito tip. The relay simulates it and keeps it until its time (15-minute slots, up to 24 h ahead, or early when all four seats fill).
- A seat (`seat.js`) is a pump.fun `buy_exact_quote_in_v3` of the not-yet-existing coin on the buyer's own nonce (seed `launchcode-seat`): every account follows from the mint and the buyer. The relay (`relay/launches.js`) checks the signature, that it only buys this coin, the nonce and the balance. 0.05 to 1 SOL a seat.
- At launch: `[launch, seat 1..4]` to six Jito block engines for about 8 s; if it can't land, the launch goes alone over RPC and the seats follow. The board records the slot of each.
- The page's relay panel shows the relay's live view of Solana: the slot, pump.fun launches seen, how many were bought by bots in their first second.

## Layout
| Path | What |
|---|---|
| `index.html`, `lc.css`, `lc.js` | the site (static) |
| `api/r.js`, `api/m.js`, `api/_relay.js` | Vercel edge proxy; coin metadata and images on the site's domain (`/m`, `/i`); where the relay runs |
| `relay/` | pump.fun feed, anti-vamp, metadata hosting, `launches.js` (arming, seats, the bundle); Worker + Durable Object or `node relay/dev.mjs` |
| `seat.js` | builds a seat (shared by the page and the tests) |
| `brand/switch.py` | Blender: coin image, hero cutout, film frames |
| `promo/film.html`, `promo/music.mjs` | the 10 s film |

LAUNCHCODE is independent and not affiliated with pump.fun, Jito or any newsroom. Memecoins are extremely risky.
