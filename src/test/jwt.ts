// A JWT for tests. Only the payload is ever parsed (readJWT), so the header and signature can be
// anything. `exp` varies the token string without varying who it is for — that is what a refresh
// looks like from the app's side, and telling "same account, new token" apart from "different
// account" is what the session rules turn on.
export const jwtFor = (customerId: string, exp = 9e9) => `h.${btoa(JSON.stringify({ exp, sub: customerId }))}.s`
