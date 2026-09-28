import asyncio, sys
from playwright.async_api import async_playwright
A = '/tmp/claude-0/-home-claude/8249339a-1fe3-5830-b016-fd59610196bc/scratchpad/audio/'
OUT = '/tmp/claude-0/-home-claude/8249339a-1fe3-5830-b016-fd59610196bc/scratchpad/shots/'
async def run(wav, js, shot=None, pre=None):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={A}{wav}', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, is_mobile=True, has_touch=True)
        await ctx.grant_permissions(['microphone'])
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: print('PAGEERROR', e))
        await pg.goto('http://localhost:8765/', wait_until='networkidle')
        await pg.click('.onb button.btn'); await pg.wait_for_timeout(300)
        if pre: await pre(pg)
        r = await pg.evaluate(js)
        if shot: await pg.screenshot(path=OUT + shot)
        await b.close()
        return r
async def tuner_pre(pg):
    await pg.click('.tab[data-tab=tuner]'); await pg.wait_for_timeout(300)
    await pg.click('#tn-go'); await pg.wait_for_timeout(1500)
async def main():
    r = await run('tuner.wav', """(async () => { const out=[]; for (let i=0;i<10;i++){ await new Promise(r=>setTimeout(r,450)); out.push(document.querySelector('#tn-n').textContent+' '+document.querySelector('#tn-o').textContent+' | '+document.querySelector('#tn-h').textContent);} return out; })()""", '50_tuner.png', tuner_pre)
    print('\n'.join(r))
    js = """(async () => { const {Mic, parseChordSymbol:P} = window.__sarig; await Mic.startMic({echo:false}); const G=P('G'), C=P('C'), res=[];
      for (let i=0;i<60;i++){ await new Promise(r=>setTimeout(r,100)); const w=Mic.whichChord([G,C]); const m=Mic.matchChord(G); res.push((w.idx===0?'G':w.idx===1?'C':'-')+(m.ok?'+':'.')); } return res.join(' '); })()"""
    print('GC:', await run('gc.wav', js))
    js2 = js.replace("P('G'), C=P('C')", "P('Em'), C=P('Am')").replace("'G':w.idx===1?'C'", "'Em':w.idx===1?'Am'")
    print('EmAm:', await run('emam.wav', js2))
asyncio.run(main())
