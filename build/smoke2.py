import asyncio
from playwright.async_api import async_playwright
OUT = '/tmp/claude-0/-home-claude/8249339a-1fe3-5830-b016-fd59610196bc/scratchpad/shots/'
SHEET = """[בית]
Am        F         C        G
שורה ראשונה של מילים לדוגמה
Am        F         C        G
שורה שנייה של מילים
[פזמון]
F    G     C    Am
פזמון לדוגמה כאן
F    G     E7
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='light')
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'TUNNEL' not in m.text else None)
        await pg.goto('http://localhost:8765/', wait_until='networkidle')
        await pg.click('.onb button.btn'); await pg.wait_for_timeout(300)
        await pg.click('#sg-lang [data-l="0"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + '20_hebrew.png')
        await pg.click('.song >> nth=3'); await pg.wait_for_timeout(1200)
        await pg.click('#pl-play'); await pg.wait_for_timeout(4500)
        await pg.screenshot(path=OUT + '21_player_light.png')
        await pg.click('#pl-mode [data-mode=yt]'); await pg.wait_for_timeout(800)
        await pg.screenshot(path=OUT + '22_yt.png')
        await pg.click('#pl-mode [data-mode=synth]'); await pg.wait_for_timeout(300)
        await pg.click('.screen [data-back]'); await pg.wait_for_timeout(500)
        await pg.click('#sg-add'); await pg.wait_for_timeout(500)
        await pg.fill('#ed-t', 'שיר בדיקה'); await pg.fill('#ed-a', 'אני')
        await pg.click('#ed-mode [data-m=sheet]'); await pg.wait_for_timeout(200)
        await pg.fill('#ed-sheet', SHEET); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + '23_editor.png', full_page=True)
        await pg.click('#ed-save'); await pg.wait_for_timeout(1500)
        await pg.click('#pl-play'); await pg.wait_for_timeout(5000)
        await pg.screenshot(path=OUT + '24_mysong.png')
        await pg.click('#pl-view'); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT + '25_mysong_grid.png')
        await pg.click('.screen [data-back]'); await pg.wait_for_timeout(500)
        # filter: only chords G C D Em with capo
        await pg.click('#sg-lang [data-l="all"]')
        await pg.click('#sg-filter'); await pg.wait_for_timeout(400)
        await pg.click('#fm-mode [data-m=only]')
        for bid in [7*5+0, 0*5+0, 2*5+0, 4*5+1]:
            await pg.click(f'#fm-picker [data-b="{bid}"]')
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + '26_filter_only.png')
        await pg.click('.sheet [data-apply]'); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT + '27_only_results.png')
        print('\n'.join(errs))
        await b.close()
asyncio.run(main())
