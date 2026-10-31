//! The words a note holds, as a Bloom filter kept in the links index: about a byte per distinct word, a false "maybe"
//! for a few percent of notes, never a false "no". A request that looks for a name in the notes' text (unlinked
//! mentions) reads only the notes that may hold it, not the whole vault.
//!
//! Words are what [`words`] cuts from lower-cased text: runs of letters, digits and `_` — the same edges a whole-word
//! mention has (links.rs `mentions`), so a note that mentions a name holds each of the name's words.

/// Bits per distinct word: three probes at 8 bits a word give about 3 % false positives.
const BITS_PER_WORD: usize = 8;
const PROBES: u64 = 3;

#[derive(Debug, Clone, Default)]
pub struct Words(Box<[u64]>);

impl Words {
    /// The words of `lower` (text already lower-cased).
    pub fn of(lower: &str) -> Self {
        let hashes: std::collections::HashSet<u64> = words(lower).map(hash).collect();
        let bits = (hashes.len() * BITS_PER_WORD).next_power_of_two().max(64);
        let mut set = vec![0u64; bits / 64].into_boxed_slice();
        for h in hashes {
            for bit in probes(h, bits) {
                set[bit / 64] |= 1 << (bit % 64);
            }
        }
        Self(set)
    }

    /// Whether the text may hold every word of `lower` (an empty filter, e.g. a note too large to look at, may hold
    /// anything).
    pub fn may_hold_all(&self, lower: &str) -> bool {
        let bits = self.0.len() * 64;
        bits == 0 || words(lower).all(|w| probes(hash(w), bits).all(|bit| self.0[bit / 64] & (1 << (bit % 64)) != 0))
    }
}

/// The words of lower-cased text.
pub fn words(lower: &str) -> impl Iterator<Item = &str> {
    lower.split(|c: char| !(c.is_alphanumeric() || c == '_')).filter(|w| !w.is_empty())
}

/// FNV-1a, then a SplitMix64 finish so the probes' low bits are spread.
fn hash(word: &str) -> u64 {
    let mut h = 0xcbf2_9ce4_8422_2325u64;
    for b in word.bytes() {
        h = (h ^ u64::from(b)).wrapping_mul(0x100_0000_01b3);
    }
    h = (h ^ (h >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    h = (h ^ (h >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    h ^ (h >> 31)
}

/// The bits a word sets, by double hashing (`bits` a power of two).
fn probes(h: u64, bits: usize) -> impl Iterator<Item = usize> {
    let (a, b) = (h, (h >> 32) | 1);
    (0..PROBES).map(move |i| (a.wrapping_add(i.wrapping_mul(b)) as usize) & (bits - 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_word_held_is_found_and_most_others_are_not() {
        let text: String = (0..500).map(|i| format!("word{i} ")).collect();
        let w = Words::of(&text);
        assert!((0..500).all(|i| w.may_hold_all(&format!("word{i}"))));
        let wrong = (500..2500).filter(|i| w.may_hold_all(&format!("word{i}"))).count();
        assert!(wrong < 200, "{wrong} of 2000 false maybes");
    }

    #[test]
    fn a_name_of_several_words_needs_them_all() {
        let w = Words::of("met dr. smith at the lab_2 meeting; ωμέγα too");
        assert!(w.may_hold_all("dr. smith"));
        assert!(w.may_hold_all("lab_2"));
        assert!(w.may_hold_all("ωμέγα"));
        assert!(!w.may_hold_all("dr. jones"));
        assert!(Words::default().may_hold_all("anything"));
    }
}
