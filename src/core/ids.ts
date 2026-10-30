// Entropic ids: prefix + 6 chars of lowercase base32 without 0 1 l o (32 symbols, 30 bits). Never
// repeat across runs (scripts can't hit a reintroduced id); never digits-only (`--tab` positions).
export const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
export const ID_LENGTH = 6

// A fresh id; `taken` is the live uniqueness check (regenerates on collision).
export function randomId(prefix: string, taken: (id: string) => boolean = () => false): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH))
    const id = prefix + Array.from(bytes, (b) => ID_ALPHABET[b & 31]).join('')
    if (!taken(id)) return id
  }
}
