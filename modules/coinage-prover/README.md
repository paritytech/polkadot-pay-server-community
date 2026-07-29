# coinage-prover

WebAssembly build of the bandersnatch **Ring-VRF prover** (`verifiable` crate,
`BandersnatchVrfVerifiable`) used by the People-chain Coinage pallet's recycler
unload-token flow. Lets the headless payment-processor backend produce the
membership proofs the wallet host would otherwise generate for
`payment.topUp({ tag: "Coins" })`, so aged Coinage coins can be offboarded to
the settlement account.

## Exposed functions (`pkg/coinage_prover.js`)

All members/proofs/aliases cross the boundary SCALE-encoded, matching the
runtime's `GenerateVerifiable` associated types.

- `member_from_entropy(entropy: Uint8Array/*32*/) -> Uint8Array/*32*/` — public key.
- `sign(entropy, message) -> Uint8Array/*64*/` — plain signature (proof_of_ownership).
- `alias_in_context(entropy, context/*32*/) -> Uint8Array/*32*/` — context alias.
- `ring_proof(exponent: number, entropy, membersScale, context, message) -> Uint8Array`
  — SCALE `(Proof, Alias)`. `exponent` 10 == `RingDomainSize::Domain12` (recycler +
  paid rings). `membersScale` is a SCALE `Vec<[u8;32]>` of the ring members.

## Build

Requires the **rustup** toolchain (Homebrew rust lacks the wasm sysroot):

```sh
PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH" \
  wasm-pack build --release --target nodejs
```

Output lands in `pkg/`. The crate pins `verifiable` at rev
`1f9f67524acce0d9c46dbbb566f84ce52757b114` (matching the individuality runtime).
