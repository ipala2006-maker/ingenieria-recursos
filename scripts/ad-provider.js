// Replace only after selecting an approved provider and reviewing its CSP/consent requirements.
// Importing this adapter must never initialize a vendor, cookies or network requests.
export const configured=false;

// Contract: mount({slot,signal}) -> {destroy()} when filled, or null when empty.
// Use an approved cross-origin/sandboxed creative frame, never vendor JS in the
// app document: that document contains private study data and Auth storage.
// Initialize the isolated provider asynchronously and honor abort/teardown.
export async function mount(){return null;}
