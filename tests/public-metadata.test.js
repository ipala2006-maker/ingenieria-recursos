const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { allowed } = require('../scripts/build-cloudflare.cjs');

const root = path.resolve(__dirname, '..');
const origin = 'https://estudiemos.ar';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const canonical = html => html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
const pageUrl = file => origin + '/' + file.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
const guideFiles = ['guias/index.html', 'guias/preparar-un-parcial.html', 'guias/derivadas-y-tasa-de-cambio.html', 'guias/cinematica-mrua.html'];
const pages = execFileSync('git', ['ls-files', '-z'], {cwd:root, encoding:'utf8'})
  .split('\0').filter(file => file.endsWith('.html') && allowed(file));

test('all published canonical and social metadata use the custom domain and final page paths', () => {
  let checked = 0;
  for (const file of pages) {
    const html = read(file);
    const expected = pageUrl(file);
    if (canonical(html)) {
      assert.equal(canonical(html), expected, file);
      checked++;
    }
    for (const [,name,value] of html.matchAll(/<meta\b[^>]*(?:name|property)="((?:og|twitter):[^"]+)"[^>]*content="([^"]+)"/gi)) {
      if (value.startsWith('__') || !/^https?:/.test(value)) continue;
      const url = new URL(value);
      assert.equal(url.origin, origin, `${file} ${name}`);
      if (name === 'og:url') assert.equal(value, expected, file);
      if (name === 'og:image' || name === 'twitter:image') assert.ok(fs.existsSync(path.join(root,url.pathname)), `${file} image exists`);
    }
  }
  assert.ok(checked >= 35, 'must check the study pages, not just the home');
});

test('robots and sitemap advertise only unique, existing canonical pages on estudiemos.ar', () => {
  assert.match(read('robots.txt'), /^Sitemap: https:\/\/estudiemos\.ar\/sitemap\.xml$/m);
  const xml = read('sitemap.xml');
  assert.doesNotMatch(xml, /workers\.dev|vercel\.app/);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(urls, ['index.html', 'instalar.html', 'about.html', ...guideFiles].map(pageUrl));
  for (const value of urls) {
    const url = new URL(value);
    assert.equal(url.origin, origin);
    const file = url.pathname.slice(1) + (url.pathname.endsWith('/') ? 'index.html' : '.html');
    assert.equal(allowed(file), true, file);
    assert.equal(canonical(read(file)), value, file);
  }
});

test('guides are reachable from the public app and readable without scripts or accounts', () => {
  for (const file of ['index.html', 'instalar.html', 'about.html']) {
    assert.ok(read(file).includes('href="/guias/"'), file);
  }
  for (const file of guideFiles) {
    const html = read(file);
    assert.doesNotMatch(html, /<script\b|<iframe\b|<form\b|noindex|data-ad-slot|\/api\//i);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
    for (const [, target] of html.matchAll(/href="(\/guias\/[^"]*)"/g)) {
      assert.ok(guideFiles.map(pageUrl).includes(origin + target), target);
    }
  }
  for (const file of guideFiles.slice(1)) {
    assert.ok(read(guideFiles[0]).includes(`href="${new URL(pageUrl(file)).pathname}"`), file);
    assert.match(read(file), /<article\b[\s\S]*<h2\b[\s\S]*<\/article>/);
  }
});
