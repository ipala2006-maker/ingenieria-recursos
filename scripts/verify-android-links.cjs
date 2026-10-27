const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function verifySigners(output, associations) {
  const entries = associations.filter(entry =>
    entry.target?.namespace === 'android_app' && entry.target.package_name === 'com.estudiemos.app');
  if (entries.length !== 1 || entries[0].relation.length !== 1 ||
      entries[0].relation[0] !== 'delegate_permission/common.handle_all_urls') {
    throw new Error('Expected one URL-handling association for the official Android app.');
  }
  const normalize = value => String(value).replace(/:/g, '').toUpperCase();
  const allowed = entries[0].target.sha256_cert_fingerprints.map(normalize);
  const signers = [...output.matchAll(/^Signer (?:#\d+|\(minSdkVersion=\d+(?: \(dev release=true\))?, maxSdkVersion=\d+\)) certificate SHA-256 digest:\s*([a-f0-9]{64})\s*$/gmi)]
    .map(match => normalize(match[1]));
  if (!signers.length) throw new Error('No APK certificate digests found in apksigner output.');
  if (signers.some(signer => !allowed.includes(signer))) {
    throw new Error('APK signing certificate does not match the domain association: ' + signers.join(', '));
  }
  return signers.length;
}

if (require.main === module) {
  try {
    const [apksigner, apk] = process.argv.slice(2);
    if (!apksigner || !apk) throw new Error('Usage: node scripts/verify-android-links.cjs APKSIGNER APK');
    const associations = JSON.parse(fs.readFileSync(path.join(__dirname, '../.well-known/assetlinks.json'), 'utf8'));
    const output = execFileSync(apksigner, ['verify', '--print-certs', apk], { encoding: 'utf8' });
    const count = verifySigners(output, associations);
    console.log(`Verified ${count} APK signer against the public App Links association.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { verifySigners };
