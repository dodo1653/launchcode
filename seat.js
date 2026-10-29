// The seat: a pump.fun buy of a coin that doesn't exist yet. Every account the buy needs follows from the mint and
// the buyer, so it can be signed now against the buyer's durable nonce and sent the moment the coin is created.
// Shared by the page and the tests: pass in @solana/web3.js as W.
export const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', T22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
export const ATA = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', WSOL = 'So11111111111111111111111111111111111111112'
export const FEE_CONFIG = '8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt'
export const BUYBACK = ['5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD', '9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7', 'GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL', '3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR', '5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6', 'EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL', '5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD', 'A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW']
export const TIPS = ['ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49', 'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh', 'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL', 'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt', 'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY', '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5', '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT', 'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe']
export const SEAT_TIP = 20_000          // lamports to Jito with each seat, so any bundle of seats pays its own way
export const LAUNCH_TIP = 500_000       // lamports to Jito with the launch (0.0005 SOL)

// pump.fun's starting curve (Global account): 1,073,000,000 virtual tokens against 30 virtual SOL
const V_TOK = 1_073_000_000_000_000n, V_SOL = 30_000_000_000n, R_TOK = 793_100_000_000_000n
// tokens a buy of `spend` lamports gets after `ahead` lamports have gone in, with fees taken out (about 1.25%, 2% to be safe)
export function tokensFor(spend, ahead) {
  const net = (x) => (BigInt(Math.floor(x)) * 9800n) / 10000n
  const k = V_TOK * V_SOL, s0 = V_SOL + net(ahead), t0 = k / s0
  const t1 = k / (s0 + net(spend))
  const out = t0 - t1, left = R_TOK - (V_TOK - t0)
  return out > left ? left : out
}

const enc = (s) => new TextEncoder().encode(s)
export function seatInstructions(W, { mint, user, spend, minOut, tipTo }) {
  const P = (s) => new W.PublicKey(s)
  const pump = P(PUMP), t22 = P(T22), tok = P(TOKEN), ata = P(ATA), wsol = P(WSOL)
  const pda = (seeds, prog = pump) => W.PublicKey.findProgramAddressSync(seeds, prog)[0]
  const ataOf = (owner, m, tp) => pda([owner.toBytes(), tp.toBytes(), m.toBytes()], ata)
  mint = P(mint); user = P(user)
  const bc = pda([enc('bonding-curve'), mint.toBytes()])
  const userAta = ataOf(user, mint, t22)
  const acct = (pubkey, w, s) => ({ pubkey, isWritable: !!w, isSigner: !!s })
  const data = new Uint8Array(24)
  data.set([225, 247, 80, 30, 213, 179, 132, 136])
  new DataView(data.buffer).setBigUint64(8, BigInt(spend), true)
  new DataView(data.buffer).setBigUint64(16, BigInt(minOut), true)
  const buy = new W.TransactionInstruction({ programId: pump, data, keys: [
    acct(pda([enc('global')])), acct(mint), acct(wsol), acct(t22), acct(tok), acct(bc, 1), acct(ataOf(bc, mint, t22), 1), acct(ataOf(bc, wsol, tok), 1),
    acct(user, 1, 1), acct(userAta, 1), acct(ataOf(user, wsol, tok), 1), acct(pda([enc('user_volume_accumulator'), user.toBytes()]), 1),
    acct(P(FEE_CONFIG)), acct(P(BUYBACK[mint.toBytes()[0] % 8]), 1), acct(W.SystemProgram.programId), acct(pda([enc('__event_authority')])), acct(pump),
  ] })
  const mkAta = new W.TransactionInstruction({ programId: ata, data: new Uint8Array([1]), keys: [
    acct(user, 1, 1), acct(userAta, 1), acct(user), acct(mint), acct(W.SystemProgram.programId), acct(t22),
  ] })
  return [
    W.ComputeBudgetProgram.setComputeUnitLimit({ units: 160_000 }),
    W.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 400_000 }),
    mkAta, buy,
    W.SystemProgram.transfer({ fromPubkey: user, toPubkey: P(tipTo || TIPS[user.toBytes()[0] % 8]), lamports: SEAT_TIP }),
  ]
}

// the whole seat transaction on the buyer's durable nonce (unsigned)
export function seatTx(W, { mint, user, spend, ahead, slippage = 0.15, noncePubkey, nonce }) {
  const expect = tokensFor(spend, ahead)
  const minOut = (expect * BigInt(Math.round((1 - slippage) * 10000))) / 10000n
  const ixs = seatInstructions(W, { mint, user, spend, minOut })
  ixs.unshift(W.SystemProgram.nonceAdvance({ noncePubkey: new W.PublicKey(noncePubkey), authorizedPubkey: new W.PublicKey(user) }))
  const msg = new W.TransactionMessage({ payerKey: new W.PublicKey(user), recentBlockhash: nonce, instructions: ixs }).compileToV0Message()
  return { tx: new W.VersionedTransaction(msg), expect, minOut }
}
