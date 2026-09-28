import asyncio
from playwright.async_api import async_playwright
A = '/tmp/claude-0/-home-claude/8249339a-1fe3-5830-b016-fd59610196bc/scratchpad/audio/'
OUT = '/tmp/claude-0/-home-claude/8249339a-1fe3-5830-b016-fd59610196bc/scratchpad/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={A}gc.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='dark')
        await ctx.grant_permissions(['microphone'])
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: print('PAGEERROR', e))
        await pg.route('https://lrclib.net/**', lambda r: r.fulfill(status=200, headers={'access-control-allow-origin': '*'}, content_type='application/json', body='[]'))
        await pg.goto('http://localhost:8765/', wait_until='networkidle')
        await pg.click('.onb button.btn'); await pg.wait_for_timeout(300)
        await pg.click('.tab[data-tab=tuner]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + '54_tuner_idle.png')
        await pg.click('.tab[data-tab=songs]'); await pg.wait_for_timeout(300)
        await pg.click('#sg-add'); await pg.wait_for_timeout(600)
        await pg.fill('#ed-t', 'בדיקת האזנה')
        await pg.click('#ed-mode [data-m=prog]'); await pg.wait_for_timeout(200)
        await pg.fill('#ed-prog', 'G:2 C:2 G:2 C:2 G:2 C:2 G:2 C:2 x3')
        await pg.click('[data-bpm="-5"]'); await pg.click('[data-bpm="-5"]')
        await pg.click('#ed-save'); await pg.wait_for_timeout(1500)
        await pg.click('#pl-mic'); await pg.wait_for_timeout(500)
        await pg.click('#pl-play'); await pg.wait_for_timeout(15000)
        await pg.screenshot(path=OUT + '55_player_listen.png')
        print(await pg.evaluate("[...document.querySelectorAll('.sl.bars .bar b')].slice(0,12).map(b=>b.textContent+(b.classList.contains('ok')?'✓':b.classList.contains('bad')?'✗':'')).join(' ')"))
        print('lis:', await pg.evaluate("document.querySelector('#pl-lis').textContent"))
        await b.close()
asyncio.run(main())
