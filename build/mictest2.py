import asyncio
from playwright.async_api import async_playwright
A = '/tmp/claude-0/-home-claude/8249339a-1fe3-5830-b016-fd59610196bc/scratchpad/audio/'
OUT = '/tmp/claude-0/-home-claude/8249339a-1fe3-5830-b016-fd59610196bc/scratchpad/shots/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={A}gc.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, is_mobile=True, has_touch=True)
        await ctx.grant_permissions(['microphone'])
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: print('PAGEERROR', e))
        await pg.goto('http://localhost:8765/', wait_until='networkidle')
        await pg.click('.onb button.btn'); await pg.wait_for_timeout(300)
        await pg.click('.tab[data-tab=trainer]'); await pg.wait_for_timeout(400)
        await pg.click('[data-ex="beg4"]'); await pg.wait_for_timeout(700)
        await pg.click('[data-dur="30"]'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=OUT + '51_ex_setup.png')
        await pg.click('#ex-start'); await pg.wait_for_timeout(12000)
        await pg.screenshot(path=OUT + '52_ex_listen.png')
        await pg.wait_for_timeout(22000)
        print('count result:', await pg.evaluate("document.querySelector('.bigtimer') && document.querySelector('.bigtimer').innerText"))
        await pg.screenshot(path=OUT + '53_ex_done.png')
        # song listening: open player of a curated song with G & C? use search
        await pg.click('.screen [data-back]'); await pg.wait_for_timeout(600)
        await b.close()
asyncio.run(main())
