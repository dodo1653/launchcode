# LAUNCHCODE

**Armed launches for pump.fun.** Sign your coin's launch now, pick a trigger, and LAUNCHCODE fires it the second the trigger hits: words in a headline, a wallet's next transaction, SOL crossing a price, a pump.fun coin graduating or reaching a market cap, or a time. The coin stays sealed (name, ticker, picture hidden) until it fires, so nobody can launch it first.

## How it works
- The creator's wallet signs the pump.fun launch (PumpPortal `trade-local`, `create`) against a **durable nonce** it owns (seed `launchcode`), plus a 0.0005 SOL Jito tip. The relay simulates it (signature checked) and keeps it.
- `relay/codes.js` watches: seven RSS newsrooms (CoinDesk, Cointelegraph, Decrypt, The Block, BBC World / Business / Tech) round robin plus Google News for each armed phrase (a headline fires a code when it contains every armed word and was published after arming); `getSignaturesForAddress` for wallet triggers; Coinbase SOL price every 15 s; the live pump.fun feed for graduations and market caps; time.
- On a hit it sends the signed launch to the RPC and to Jito's block engines at once, and records what tripped it and how long it took to land.
- Armed for up to 72 hours. The creator can disarm by advancing or closing their nonce account.

## Layout
| Path | What |
|---|---|
| `index.html`, `lc.css`, `lc.js` | the site (static) |
| `api/r.js`, `api/m.js`, `api/_relay.js` | Vercel edge proxy; coin metadata and images on the site's domain (`/m`, `/i`); where the relay runs |
| `relay/` | pump.fun feed, anti-vamp, metadata hosting, `codes.js` (arming, triggers, firing); Worker + Durable Object or `node relay/dev.mjs` |
| `brand/switch.py` | Blender: coin image, hero cutout, film frames |
| `promo/film.html`, `promo/music.mjs` | the 10 s film |

LAUNCHCODE is independent and not affiliated with pump.fun, Jito or any newsroom. Memecoins are extremely risky.
