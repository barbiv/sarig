"""HIG polish checks: push parallax, long-press action sheet, search cancel, segmented thumb, receded sheet, deep link."""
import asyncio, json
from playwright.async_api import async_playwright
OUT = '/tmp/claude-0/-home-claude/8249339a-1fe3-5830-b016-fd59610196bc/scratchpad/shots/'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='light',
                                  user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_' not in m.text else None)
        await pg.route('https://lrclib.net/**', lambda r: r.fulfill(status=404, body=''))
        await pg.route('**/search?q=**', lambda r: r.fulfill(status=200, headers={'access-control-allow-origin': '*'}, content_type='application/json', body='{"items":[]}'))
        cdp = await ctx.new_cdp_session(pg)
        await pg.goto('http://localhost:8765/', wait_until='networkidle')
        await pg.click('.onb button.btn'); await pg.wait_for_timeout(600)
        # segmented thumb
        await pg.click('#sg-lang [data-l="0"]'); await pg.wait_for_timeout(80)
        await pg.screenshot(path=OUT + 'p1_seg_mid.png', clip={'x': 0, 'y': 200, 'width': 393, 'height': 200})
        await pg.wait_for_timeout(500)
        print('thumb', await pg.evaluate("(() => { const t = document.querySelector('#sg-lang .seg-thumb'); const b = document.querySelector('#sg-lang [aria-pressed=true]'); return t && [Math.round(t.getBoundingClientRect().left), Math.round(b.getBoundingClientRect().left), t.style.opacity]; })()"))
        await pg.click('#sg-lang [data-l="all"]'); await pg.wait_for_timeout(500)
        # search cancel
        await pg.click('#sg-q'); await pg.wait_for_timeout(400)
        await pg.fill('#sg-q', 'yesterday'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT + 'p2_search.png', clip={'x': 0, 'y': 0, 'width': 393, 'height': 420})
        await pg.click('#sg-qc'); await pg.wait_for_timeout(500)
        print('after cancel', await pg.evaluate("[document.querySelector('#sg-q').value, document.activeElement.id, document.querySelector('#sg-sr').className]"))
        # long press
        box = await pg.locator('.song >> nth=1').bounding_box()
        x, y = box['x'] + 200, box['y'] + 30
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        await pg.wait_for_timeout(700)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        await pg.wait_for_timeout(600)
        print('action sheet', await pg.evaluate("[!!document.querySelector('.asheet.on'), [...document.querySelectorAll('.as-btn')].map(b => b.textContent.trim()), document.querySelectorAll('.page.screen').length]"))
        await pg.screenshot(path=OUT + 'p3_actions.png')
        await pg.click('.as-cancel'); await pg.wait_for_timeout(500)
        print('after cancel sheet', await pg.evaluate("[document.querySelectorAll('.asheet').length, document.body.style.position]"))
        # push transition mid-flight
        await pg.click('.song >> nth=0'); await pg.wait_for_timeout(120)
        print('parallax', await pg.evaluate("[document.querySelector('#v-songs').style.transform, getComputedStyle(document.querySelector('#v-songs')).transform, getComputedStyle(document.querySelector('.navdim')).opacity]"))
        await pg.screenshot(path=OUT + 'p4_push_mid.png')
        await pg.wait_for_timeout(1500)
        await pg.wait_for_timeout(2500)
        print('yt manual clickable', await pg.evaluate("(() => { const b = document.querySelector('#pl-yt [data-paste]'); if (!b) return 'no manual ui: ' + (document.querySelector('#pl-yt')||{}).innerText; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return b.contains(e); })()"))
        await pg.screenshot(path=OUT + 'p4b_yt_manual.png')
        await pg.click('#pl-set'); await pg.wait_for_timeout(250)
        await pg.screenshot(path=OUT + 'p5_sheet_mid.png')
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT + 'p5_sheet.png')
        await pg.click('.sheet [data-close]'); await pg.wait_for_timeout(600)
        print('after sheet', await pg.evaluate("[document.documentElement.className, document.querySelector('.page.screen').style.transform]"))
        await pg.click('.screen [data-back]'); await pg.wait_for_timeout(120)
        await pg.screenshot(path=OUT + 'p6_pop_mid.png')
        await pg.wait_for_timeout(600)
        print('after pop', await pg.evaluate("[document.querySelectorAll('.page.screen').length, document.querySelector('#v-songs').style.transform, document.querySelector('.navdim').style.display]"))
        # filter sheet (tall) from tab page after scrolling
        await pg.evaluate("scrollTo(0, 900)"); await pg.wait_for_timeout(300)
        await pg.click('#sg-filter', force=True); await pg.wait_for_timeout(700)
        await pg.screenshot(path=OUT + 'p7_filter.png')
        await pg.click('.sheet [data-apply]'); await pg.wait_for_timeout(700)
        print('after filter', await pg.evaluate("[scrollY, document.documentElement.className, document.querySelector('#v-songs').style.clipPath]"))
        # tab switch
        await pg.click('.tab[data-tab=progress]'); await pg.wait_for_timeout(90)
        await pg.screenshot(path=OUT + 'p8_tab_mid.png')
        await pg.wait_for_timeout(700)
        # deep link
        k = await pg.evaluate("document.querySelector('.song') ? null : null")
        pg2 = await ctx.new_page()
        pg2.on('pageerror', lambda e: errs.append('PAGEERROR2 ' + str(e)))
        await pg2.goto('http://localhost:8765/#s=' + 'db%3A' , wait_until='networkidle')
        await pg2.wait_for_timeout(800)
        print('deeplink bad key toast', await pg2.evaluate("(document.querySelector('.toast.on')||{}).textContent"))
        print('\n'.join(errs[:20]))
        await b.close()
asyncio.run(main())
