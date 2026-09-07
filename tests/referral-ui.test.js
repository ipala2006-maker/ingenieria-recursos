const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../scripts/account.js'), 'utf8');

function refreshHarness(status) {
  const pending = new Map([['pending', 'INVITE123']]);
  const claims = [];
  const context = {
    session: { access_token:'test' }, referralStatusLoaded:false, referralBusy:false,
    PENDING_REFERRAL_KEY:'pending',
    getRootPath: () => '/', setReferralButtonsBusy() {},
    fetch: async () => ({ ok:true, json:async () => ({ referral:status }) }),
    renderReferralStatus(value) { if (value.wasReferred) pending.delete('pending'); },
    normalizeReferralCode: (value) => value || '',
    localStorage: { getItem: (key) => pending.get(key) },
    claimReferralCode: async () => { assert.equal(context.referralBusy, false); claims.push('claimed'); },
    document: { querySelector: () => null }
  };
  vm.createContext(context);
  const start = source.indexOf('  async function refreshReferralStatus(');
  const end = source.indexOf('  async function sendReferralPhoneCode(', start);
  vm.runInContext(source.slice(start, end), context);
  return { context, claims };
}

test('profile has a share link, never a manual invitation field', () => {
  assert.doesNotMatch(source, /data-account-referral-claim-input|data-account-referral-claim-button|Tu código/);
  assert.match(source, /Compartir enlace/);
  assert.match(source, /instalar\.html\?ref=/);
  assert.match(source, /autocomplete="one-time-code"/);
});

test('verified pending invitation resumes after status fetch releases its lock', async () => {
  const { context, claims } = refreshHarness({ phoneVerified:true, wasReferred:false });
  await context.refreshReferralStatus();
  assert.equal(claims.length, 1);
});

test('unverified identity never automatically claims an invitation', async () => {
  const { context, claims } = refreshHarness({ phoneVerified:false });
  await context.refreshReferralStatus();
  assert.equal(claims.length, 0);
});

test('already linked invitation does not run twice on reopening profile', async () => {
  const { context, claims } = refreshHarness({ phoneVerified:true, wasReferred:true });
  await context.refreshReferralStatus();
  await context.refreshReferralStatus(true);
  assert.equal(claims.length, 0);
});

test('signing out while the status loads cannot apply the pending invitation', async () => {
  const { context, claims } = refreshHarness({ phoneVerified:true });
  context.fetch = async () => {
    context.session = null;
    return {ok:true,json:async()=>({referral:{phoneVerified:true}})};
  };
  await context.refreshReferralStatus();
  assert.equal(claims.length, 0);
});

test('automatic SMS dialog does not launch a competing referral request', () => {
  const start = source.indexOf('  async function beginPendingPhoneVerification(');
  const end = source.indexOf('  async function refreshReferralStatus(',start);
  assert.match(source.slice(start,end), /openDialog\(\{ refreshReferrals: false \}\)/);
  assert.match(source.slice(start,end), /if \(referralBusy\)/);
});
