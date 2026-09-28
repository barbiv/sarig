import asyncio, urllib.parse, re
from playwright.async_api import async_playwright
OUT = '/tmp/claude-0/-home-claude/8249339a-1fe3-5830-b016-fd59610196bc/scratchpad/shots/'
async def main():
    code = open('/home/claude/guitar-app/src/bookmarklet_url.js').read()
    url = re.search(r'"(javascript:[^"]+)"', code).group(1)
    js = urllib.parse.unquote(url[len('javascript:'):])
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, is_mobile=True, has_touch=True)
        await ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: print('PAGEERROR', e))
        await pg.goto('http://localhost:8766/song.html')
        await pg.evaluate(js)
        await pg.screenshot(path=OUT + '60_bm_overlay.png')
        await pg.click('button:text-is("העתק")'); await pg.wait_for_timeout(300)
        clip = await pg.evaluate('navigator.clipboard.readText()')
        print(clip)
        await pg.goto('http://localhost:8765/', wait_until='networkidle')
        await pg.click('.onb button.btn'); await pg.wait_for_timeout(300)
        await pg.click('#sg-paste'); await pg.wait_for_timeout(900)
        print('title:', await pg.input_value('#ed-t'), '| artist:', await pg.input_value('#ed-a'))
        await pg.screenshot(path=OUT + '61_import_editor.png', full_page=True)
        await b.close()
asyncio.run(main())
