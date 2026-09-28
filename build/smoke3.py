"""iPhone 15 Pro QA run (393x852). Mocks LRCLIB/Piped with fake data (no real lyrics)."""
import asyncio, json
from playwright.async_api import async_playwright
OUT = '/tmp/claude-0/-home-claude/8249339a-1fe3-5830-b016-fd59610196bc/scratchpad/shots/'
FAKE_LRC = "\n".join(f"[00:{10+i*4:02d}.00] Line number {i+1} of the fake lyric text" for i in range(12))
SHEET = """[פתיחה]
Am   F   C   G
[בית]
Am            F
שורה ראשונה במבחן הזה
C               G
שורה שנייה במבחן הזה
[פזמון]
F        G        Am
שורה שלישית עם פזמון
F        E7
שורה רביעית וסיום
"""
HE_LRC = "[00:08.00] שורה ראשונה במבחן הזה\n[00:12.50] שורה שנייה במבחן הזה\n[00:17.00] שורה שלישית עם פזמון\n[00:21.50] שורה רביעית וסיום\n[00:26.00] \n"


async def swipe_back(pg, cdp):
    W = 393
    pts = [W - 4, W - 40, W - 120, W - 220, W - 300]
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': pts[0], 'y': 400}]})
    for x in pts[1:]:
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': 402}]})
        await pg.wait_for_timeout(16)
    await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    await pg.wait_for_timeout(600)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=3, is_mobile=True, has_touch=True, color_scheme='dark',
                                  user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_' not in m.text else None)

        async def lrc(route):
            u = route.request.url
            if '%D7' in u:
                body = [{"trackName": "שיר בדיקה", "artistName": "אני", "duration": 40, "syncedLyrics": HE_LRC}]
            else:
                body = [{"trackName": "Let It Be", "artistName": "The Beatles", "duration": 243, "syncedLyrics": FAKE_LRC}]
            await route.fulfill(status=200, headers={'access-control-allow-origin': '*'}, content_type='application/json', body=json.dumps(body))
        await pg.route('https://lrclib.net/**', lrc)
        await pg.route('**/search?q=**', lambda r: r.fulfill(status=200, headers={'access-control-allow-origin': '*'}, content_type='application/json', body='{"items":[]}'))
        cdp = await ctx.new_cdp_session(pg)
        await pg.goto('http://localhost:8765/', wait_until='networkidle')
        await pg.click('.onb button.btn'); await pg.wait_for_timeout(400)
        print('tabbar', await pg.evaluate("(() => { const t = document.querySelector('.tabbar').getBoundingClientRect(); return [t.top, t.bottom, innerHeight]; })()"))
        await pg.mouse.wheel(0, 3000); await pg.wait_for_timeout(600)
        print('after scroll', await pg.evaluate("[scrollY, document.querySelector('.tabbar').getBoundingClientRect().bottom, document.querySelectorAll('.song').length, !!document.querySelector('#v-songs .topbar.scrolled')]"))
        await pg.screenshot(path=OUT + '30_songs_scrolled.png')
        await pg.evaluate("scrollTo(0,0)"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=OUT + '30b_songs_top.png')
        await pg.fill('#sg-q', 'let it be'); await pg.wait_for_timeout(500)
        await pg.click('.song >> nth=0'); await pg.wait_for_timeout(2000)
        await pg.screenshot(path=OUT + '31_player_yt_default.png')
        await pg.click('#pl-mode [data-mode=synth]'); await pg.wait_for_timeout(300)
        await pg.click('#pl-play'); await pg.wait_for_timeout(16000)
        await pg.screenshot(path=OUT + '32_player_sheet.png')
        await pg.click('#pl-set'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT + '33_settings.png')
        await pg.click('.sheet [data-close]'); await pg.wait_for_timeout(400)
        await pg.click('#pl-view'); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT + '34_lane.png')
        await pg.click('#pl-view'); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT + '35_grid.png')
        await pg.click('#pl-view'); await pg.wait_for_timeout(300)
        await pg.click('#pl-play'); await pg.wait_for_timeout(300)
        await swipe_back(pg, cdp)
        print('after swipe back', await pg.evaluate("[document.querySelectorAll('.page.screen').length, document.body.classList.contains('has-screen')]"))
        await pg.screenshot(path=OUT + '36_after_swipe.png')
        await pg.fill('#sg-q', 'ירושלים של זהב'); await pg.wait_for_timeout(500)
        await pg.click('.song >> nth=0'); await pg.wait_for_timeout(1200)
        await pg.click('#pl-play'); await pg.wait_for_timeout(5000)
        await pg.screenshot(path=OUT + '37_bars_sheet.png')
        await pg.click('.screen [data-back]'); await pg.wait_for_timeout(700)
        await pg.click('#sg-add'); await pg.wait_for_timeout(700)
        await pg.fill('#ed-t', 'שיר בדיקה'); await pg.fill('#ed-a', 'אני')
        await pg.fill('#ed-sheet', SHEET); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + '38_editor.png', full_page=True)
        await pg.click('#ed-save'); await pg.wait_for_timeout(2500)
        await pg.click('#pl-mode [data-mode=synth]'); await pg.wait_for_timeout(300)
        await pg.click('#pl-play'); await pg.wait_for_timeout(12000)
        await pg.screenshot(path=OUT + '39_aligned.png')
        print('aligned', await pg.evaluate("(() => { const s = JSON.parse(localStorage.getItem('fretline-state')); const m = Object.values(s.mySongs)[0]; return [!!m.tev, m.syncInfo, m.tev && m.tev.slice(0,6)]; })()"))
        await pg.click('.screen [data-back]'); await pg.wait_for_timeout(700)
        for t in ['chords', 'tuner', 'trainer', 'progress']:
            await pg.click(f'.tab[data-tab={t}]'); await pg.wait_for_timeout(500)
            await pg.screenshot(path=OUT + f'40_{t}.png')
        await pg.click('.tab[data-tab=trainer]'); await pg.wait_for_timeout(300)
        await pg.click('[data-ex] >> nth=0'); await pg.wait_for_timeout(700)
        await pg.screenshot(path=OUT + '41_exercise.png')
        await swipe_back(pg, cdp)
        print('after ex swipe', await pg.evaluate("document.querySelectorAll('.page.screen').length"))
        print('\n'.join(errs[:20]))
        await b.close()

asyncio.run(main())
