// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
//! WebAssembly bindings for the Coinage recycler Ring-VRF prover.
//!
//! Reproduces the off-chain proving the wallet host performs for
//! `payment.topUp({ tag: "Coins" })` — i.e. the recycler unload-token flow on
//! the People chain — so a headless backend can offboard aged Coinage coins.
//!
//! All members/proofs/aliases cross the WASM boundary SCALE-encoded, matching
//! `verifiable`'s `FullCodec` impls, so the TypeScript side can drop them
//! straight into extrinsic payloads.

use parity_scale_codec::{Decode, Encode};
use verifiable::ring::bandersnatch::BandersnatchVrfVerifiable as Crypto;
use verifiable::ring::RingDomainSize;
use verifiable::{Entropy, GenerateVerifiable};
use wasm_bindgen::prelude::*;

type Member = <Crypto as GenerateVerifiable>::Member;

fn secret_from(entropy: &[u8]) -> Result<<Crypto as GenerateVerifiable>::Secret, JsError> {
    let e: Entropy = entropy
        .try_into()
        .map_err(|_| JsError::new("entropy must be 32 bytes"))?;
    Ok(Crypto::new_secret(e))
}

/// Ring exponent `R2e10` (used by both recycler and paid-unload-token rings on
/// the People runtime) maps to `RingDomainSize::Domain12`.
fn domain(exponent: u8) -> Result<RingDomainSize, JsError> {
    match exponent {
        9 => Ok(RingDomainSize::Domain11),
        10 => Ok(RingDomainSize::Domain12),
        14 => Ok(RingDomainSize::Domain16),
        _ => Err(JsError::new("unsupported ring exponent")),
    }
}

/// SCALE-encoded `Member` (public key) for a 32-byte secret entropy.
#[wasm_bindgen]
pub fn member_from_entropy(entropy: &[u8]) -> Result<Vec<u8>, JsError> {
    let secret = secret_from(entropy)?;
    Ok(Crypto::member_from_secret(&secret).encode())
}

/// SCALE-encoded non-anonymous `Signature` of `message` by the member secret.
/// Used for `proof_of_ownership` in load/pay-fee calls.
#[wasm_bindgen]
pub fn sign(entropy: &[u8], message: &[u8]) -> Result<Vec<u8>, JsError> {
    let secret = secret_from(entropy)?;
    let sig = Crypto::sign(&secret, message).map_err(|_| JsError::new("sign failed"))?;
    Ok(sig.encode())
}

/// 32-byte `Alias` the secret would have in `context`.
#[wasm_bindgen]
pub fn alias_in_context(entropy: &[u8], context: &[u8]) -> Result<Vec<u8>, JsError> {
    let secret = secret_from(entropy)?;
    let alias = Crypto::alias_in_context(&secret, context)
        .map_err(|_| JsError::new("alias_in_context failed"))?;
    Ok(alias.encode())
}

/// Build a Ring-VRF membership proof over `members` (a SCALE-encoded
/// `Vec<Member>`) for the given ring `exponent`, `context` and `message`.
/// Returns SCALE-encoded `(Proof, Alias)`.
#[wasm_bindgen]
pub fn ring_proof(
    exponent: u8,
    entropy: &[u8],
    members_scale: &[u8],
    context: &[u8],
    message: &[u8],
) -> Result<Vec<u8>, JsError> {
    let secret = secret_from(entropy)?;
    let members: Vec<Member> = Decode::decode(&mut &members_scale[..])
        .map_err(|_| JsError::new("failed to decode Vec<Member>"))?;
    let member = Crypto::member_from_secret(&secret);
    let commitment = Crypto::open(domain(exponent)?, &member, members.into_iter())
        .map_err(|_| JsError::new("open failed: member not in ring?"))?;
    let (proof, alias) = Crypto::create(commitment, &secret, context, message)
        .map_err(|_| JsError::new("create failed"))?;
    Ok((proof, alias).encode())
}
