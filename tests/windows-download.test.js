const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
test('Windows download checksum identifies the exact published binary, never a safety bypass',()=>{
  const name='Estudiemos-Para-Windows.exe',bytes=fs.readFileSync(path.join(root,'downloads',name));
  const expected=crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(fs.readFileSync(path.join(root,'downloads/Estudiemos-Para-Windows.sha256'),'utf8').trim(),expected+'  '+name);
  assert.equal(require('../scripts/build-cloudflare.cjs').allowed('downloads/Estudiemos-Para-Windows.sha256'),true);
  const html=fs.readFileSync(path.join(root,'instalar.html'),'utf8');
  assert.match(html,/todavía no tiene firma digital/);
  assert.match(html,/no desactives la protección ni ignores una alerta/);
});
