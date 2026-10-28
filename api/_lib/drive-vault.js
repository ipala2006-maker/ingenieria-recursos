const crypto = require('node:crypto');

const HEX=/^[a-f0-9]{64}$/i,ID=/^[a-z][a-z0-9_-]{0,31}$/;
function legacyKey(env=process.env) {
  const raw=env.DRIVE_TOKEN_ENCRYPTION_KEY||'';
  if (!HEX.test(raw)) throw new Error('DRIVE_NOT_CONFIGURED');
  return Buffer.from(raw, 'hex');
}
function keyring(env=process.env){
  const raw=env.DRIVE_TOKEN_KEYRING||'';
  if(!raw)return Object.create(null);
  if(raw.length>2048)throw new Error('DRIVE_NOT_CONFIGURED');
  let value;try{value=JSON.parse(raw);}catch{throw new Error('DRIVE_NOT_CONFIGURED');}
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length>4)throw new Error('DRIVE_NOT_CONFIGURED');
  const keys=Object.create(null);
  for(const [id,key]of Object.entries(value)){
    if(!ID.test(id)||typeof key!=='string'||!HEX.test(key))throw new Error('DRIVE_NOT_CONFIGURED');
    keys[id]=Buffer.from(key,'hex');
  }
  return keys;
}
function activeKeyId(env=process.env){
  const id=env.DRIVE_TOKEN_ACTIVE_KEY_ID||'';
  if(id&&!ID.test(id))throw new Error('DRIVE_NOT_CONFIGURED');
  if(id&&!Object.hasOwn(keyring(env),id))throw new Error('DRIVE_NOT_CONFIGURED');
  return id;
}
function configured(env=process.env){
  try{const keys=keyring(env),id=activeKeyId(env);return id?Object.hasOwn(keys,id):Boolean(legacyKey(env));}catch{return false;}
}
function envelopeKeyId(raw){
  if(typeof raw!=='string'||raw.length>24000)throw new Error('INVALID_DRIVE_CREDENTIAL');
  if(!raw.startsWith('v2.'))return '';
  const parts=raw.split('.');
  if(parts.length!==3||!ID.test(parts[1]))throw new Error('INVALID_DRIVE_CREDENTIAL');
  return parts[1];
}
function aad(id,purpose){
  if(typeof purpose!=='string'||!purpose||purpose.length>160)throw new Error('INVALID_DRIVE_CREDENTIAL');
  return Buffer.from(id?'estudiemos.drive.v2:'+id+':'+purpose:'estudiemos.drive.v1:'+purpose);
}
function seal(value, purpose) {
  const id=activeKeyId(),key=id?keyring()[id]:legacyKey();
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(id,purpose));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const encoded=Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');
  const result=id?'v2.'+id+'.'+encoded:encoded;
  if(result.length>24000)throw new Error('INVALID_DRIVE_CREDENTIAL');
  return result;
}
function unseal(raw, purpose) {
  const id=envelopeKeyId(raw),encoded=id?raw.split('.')[2]:raw;
  if(!/^[A-Za-z0-9_-]+$/.test(encoded))throw new Error('INVALID_DRIVE_CREDENTIAL');
  const bytes=Buffer.from(encoded,'base64url');
  if(bytes.length<29||bytes.toString('base64url')!==encoded)throw new Error('INVALID_DRIVE_CREDENTIAL');
  const keys=id?keyring():null,key=id?keys[id]:legacyKey();
  if(!key)throw new Error('DRIVE_KEY_UNAVAILABLE');
  try{
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAAD(aad(id,purpose));cipher.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));
  }catch{throw new Error('INVALID_DRIVE_CREDENTIAL');}
}
module.exports = { seal, unseal, configured, activeKeyId, envelopeKeyId };
