"""Offline browser regression checks for the project-owned, opaque-origin preview.

Run: CHROME_BIN=/usr/bin/chromium python tests/portal_preview.py
Requires Playwright and a Chromium installation. No physical MIDI device required.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
from urllib.parse import urljoin
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'test-results'
OUTPUT.mkdir(exist_ok=True)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

manifest = json.loads((ROOT / 'portal/metadata.json').read_text())
base = 'https://muk-research.github.io/Klavier/portal/metadata.json'
assert manifest['version'] == 1
assert manifest['title'] == 'Expressive Performance Lab'
assert urljoin(base, manifest['project']) == 'https://muk-research.github.io/Klavier/'
for key in ('preview', 'embed'):
    assert (ROOT / 'portal' / manifest[key]).is_file()
assert manifest['category'] == 'learning'
assert 'Performance' in manifest['tags']

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    shutil.copytree(ROOT / 'portal', root / 'Klavier/portal')
    (root / 'index.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8">
      <title>Portal contract test harness</title><style>body{margin:0;background:#101211}
      iframe{display:block;width:360px;border:0;height:270px;max-width:100%}</style>
      <iframe title="Preview" sandbox="allow-scripts"
      allow="camera 'none'; microphone 'none'; midi 'none'; autoplay 'none'"
      src="/Klavier/portal/index.html?prlToken=test-token&amp;embed=1&amp;motion=on"></iframe>
      <script>window.messages=[];const frame=document.querySelector('iframe');
      addEventListener('message',e=>{if(e.source!==frame.contentWindow||e.data?.token!=='test-token')return;
        messages.push(e.data);if(e.data.type==='prl:resize')frame.style.height=Math.max(180,Math.min(520,e.data.height))+'px';});
      window.visibility=(active,token='test-token')=>frame.contentWindow.postMessage({type:'prl:visibility',active,token},'*');
      </script></html>''')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=temp))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=os.getenv('CHROME_BIN'), args=['--no-sandbox'])
            context = browser.new_context(viewport={'width':1024, 'height':800})
            context.add_init_script('''window.__hardwareRequests=0;
              navigator.requestMIDIAccess=()=>{window.__hardwareRequests++;throw Error('MIDI forbidden')};
              if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{window.__hardwareRequests++;throw Error('Media forbidden')};
              Object.defineProperty(window,'localStorage',{get(){throw Error('Storage forbidden')}});
              Object.defineProperty(window,'indexedDB',{get(){throw Error('Storage forbidden')}});''')
            page = context.new_page()
            errors, requests = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: requests.append(request.url))
            page.goto(url)
            page.wait_for_function("messages.some(m=>m.type==='prl:ready')")
            frame = page.frame_locator('iframe')
            expect(page.locator('iframe')).to_have_attribute('sandbox', 'allow-scripts')
            expect(frame.locator('body')).to_have_attribute('data-running','true')
            assert frame.locator('body').evaluate('()=>window.__hardwareRequests') == 0
            assert frame.locator('body').evaluate('()=>document.documentElement.scrollWidth <= innerWidth')
            assert 180 <= page.locator('iframe').evaluate('el=>el.clientHeight') <= 520
            # Presentation must have no secondary requests: just host and inline sketch.
            assert requests == [url, url+'Klavier/portal/index.html?prlToken=test-token&embed=1&motion=on'], requests
            frame.locator('#motion').click()
            expect(frame.locator('body')).to_have_attribute('data-running','false')
            image = frame.locator('canvas').evaluate('el=>el.toDataURL()')
            page.wait_for_timeout(140)
            assert image == frame.locator('canvas').evaluate('el=>el.toDataURL()')
            frame.locator('#arc').fill('25')
            expect(frame.locator('#arc-value')).to_have_text('25%')
            assert image != frame.locator('canvas').evaluate('el=>el.toDataURL()')
            frame.locator('#sway').fill('80')
            expect(frame.locator('#sway-value')).to_have_text('80%')
            frame.get_by_role('button', name='Even', exact=True).click()
            expect(frame.locator('#arc-value')).to_have_text('0%')
            expect(frame.locator('#sway-value')).to_have_text('0%')
            frame.get_by_role('button', name='Linger', exact=True).click()
            expect(frame.locator('#arc-value')).to_have_text('90%')
            expect(frame.locator('#sway-value')).to_have_text('95%')
            frame.get_by_role('button', name='Arch', exact=True).click()
            frame.locator('#arc').focus()
            page.keyboard.press('ArrowRight')
            expect(frame.locator('#arc-value')).to_have_text('71%')
            frame.locator('#motion').click()
            page.evaluate('visibility(false)')
            expect(frame.locator('body')).to_have_attribute('data-running','false')
            page.evaluate("visibility(true,'wrong-token')")
            page.wait_for_timeout(100)
            expect(frame.locator('body')).to_have_attribute('data-running','false')
            # A child-origin message with a correct token must also be ignored.
            frame.locator('body').evaluate("()=>window.postMessage({type:'prl:visibility',token:'test-token',active:true},'*')")
            page.wait_for_timeout(100)
            expect(frame.locator('body')).to_have_attribute('data-running','false')
            page.evaluate('visibility(true)')
            expect(frame.locator('body')).to_have_attribute('data-running','true')
            frame.locator('#motion').click()
            page.evaluate('visibility(false);visibility(true)')
            expect(frame.locator('body')).to_have_attribute('data-running','false')
            expect(frame.locator('#standalone-link')).to_be_hidden()
            page.screenshot(path=str(OUTPUT/'portal-sandbox.png'))
            for width in (280, 320, 375, 600):
                page.locator('iframe').evaluate('(el,w)=>el.style.width=w+"px"', width)
                page.wait_for_timeout(80)
                assert frame.locator('body').evaluate('()=>document.documentElement.scrollWidth <= innerWidth')
                assert frame.locator('body').evaluate('()=>document.body.scrollHeight <= innerHeight')
            page.goto(url+'Klavier/portal/?motion=off')
            expect(page.locator('body')).to_have_attribute('data-running','false')
            expect(page.locator('#standalone-link')).to_be_visible()
            page.set_viewport_size({'width':375,'height':700})
            page.screenshot(path=str(OUTPUT/'portal-mobile.png'), full_page=True)
            page.set_viewport_size({'width':720,'height':650})
            page.screenshot(path=str(OUTPUT/'portal-wide.png'), full_page=True)
            assert not errors, errors
            context.close()
            context = browser.new_context(reduced_motion='reduce')
            page = context.new_page()
            page.goto(url)
            frame = page.frame_locator('iframe')
            expect(frame.locator('body')).to_have_attribute('data-running','false')
            expect(frame.locator('#motion')).to_have_attribute('aria-pressed','false')
            page.evaluate('visibility(true)')
            expect(frame.locator('body')).to_have_attribute('data-running','false')
            frame.locator('#motion').click()
            expect(frame.locator('body')).to_have_attribute('data-running','true')
            context.close()
            browser.close()
    finally:
        server.shutdown()
print('PASS: metadata, subpaths, opaque sandbox, handshake, no hardware/storage/network, controls, keyboard, trusted motion messages, persistent manual pause, reduced motion, 280–600px layout.')
