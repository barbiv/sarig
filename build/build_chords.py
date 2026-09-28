import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from chords import QUALITIES, SH
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(ROOT, 'raw/chordsdb/lib/guitar.json')))
KEYS = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
DBKEY = {'C#':'C#','Eb':'Eb','F#':'F#','Ab':'Ab','Bb':'Bb'}
MAP = {'':'major','m':'minor','7':'7','maj7':'maj7','m7':'m7','sus2':'sus2','sus4':'sus4','7sus4':'7sus4','dim':'dim',
       'dim7':'dim7','m7b5':'m7b5','aug':'aug','6':'6','m6':'m6','add9':'add9','9':'9','maj9':'maj9','m9':'m9',
       'madd9':'madd9','5':'5','mMaj7':'mmaj7','7#9':'7#9','7b9':'7b9','13':'13','6/9':'69','aug7':'aug7','7b5':'7b5'}
IV = {'':[0,4,7],'m':[0,3,7],'7':[0,4,7,10],'maj7':[0,4,7,11],'m7':[0,3,7,10],'sus2':[0,2,7],'sus4':[0,5,7],
      '7sus4':[0,5,7,10],'dim':[0,3,6],'dim7':[0,3,6,9],'m7b5':[0,3,6,10],'aug':[0,4,8],'6':[0,4,7,9],'m6':[0,3,7,9],
      'add9':[0,2,4,7],'9':[0,2,4,7,10],'maj9':[0,2,4,7,11],'m9':[0,2,3,7,10],'madd9':[0,2,3,7],'5':[0,7],
      'mMaj7':[0,3,7,11],'7#9':[0,3,4,7,10],'7b9':[0,1,4,7,10],'13':[0,4,7,9,10,2],'6/9':[0,2,4,7,9],
      'aug7':[0,4,8,10],'7b5':[0,4,6,10]}
TUNE = [4,9,2,7,11,4]
BASS = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
by = {k: {c['suffix']: c['positions'] for c in d['chords'].get(k if k!='C#' else 'C#', [])} for k in d['chords']}
out = {}
bad = 0
tot = 0
def conv(p):
    fr = []
    for f in p['frets']:
        fr.append(-1 if f < 0 else (0 if f == 0 else p['baseFret'] + f - 1))
    return {'f': fr, 'g': p['fingers'], 'b': p['baseFret'], 'r': [p['baseFret'] + x - 1 for x in p.get('barres', [])]}
def pcs(fr):
    return {(TUNE[i] + f) % 12 for i, f in enumerate(fr) if f >= 0}
def lowest(fr):
    for i, f in enumerate(fr):
        if f >= 0:
            return (TUNE[i] + f) % 12
for ri, k in enumerate(KEYS):
    dk = 'C#' if k == 'C#' else k
    table = by.get({'C#':'Csharp','F#':'Fsharp'}.get(k, k), {})
    for q in QUALITIES:
        poss = table.get(MAP[q], [])
        need = {(ri + x) % 12 for x in IV[q]}
        keep = []
        for p in poss:
            tot += 1
            c = conv(p)
            got = pcs(c['f'])
            ok = got <= need and ri in got
            c['inv'] = 0 if lowest(c['f']) == ri else 1
            # essential tones: third/quality tones except fifth
            ess = {(ri + x) % 12 for x in IV[q] if x not in (7,)}
            if q in ('13','9','m9','maj9','7#9','7b9','6/9'):
                ess = {(ri + x) % 12 for x in IV[q] if x not in ((7, 0, 2) if q == '13' else (7, 0))}
            ok = ok and ess <= got
            if ok:
                keep.append(c)
            else:
                bad += 1
        keep.sort(key=lambda c: c['inv'])
        for c in keep:
            if not c['inv']: del c['inv']
        out['%d|%s' % (ri, q)] = keep
    # slash chords
    for b in range(12):
        if b == ri: continue
        for q, pre in (('', '/'), ('m', 'm/')):
            poss = table.get(pre + BASS[b], []) or table.get(pre + {'Eb':'D#','Ab':'G#','Bb':'A#','C#':'Db','F#':'Gb'}.get(BASS[b], BASS[b]), [])
            keep = []
            for p in poss:
                c = conv(p)
                if lowest(c['f']) == b and ((ri + (3 if q else 4)) % 12) in pcs(c['f']):
                    keep.append(c)
            if keep:
                out['%d|%s|%d' % (ri, q, b)] = keep
out['4|madd9'] = [{'f': [0,2,4,0,0,0], 'g': [0,1,3,0,0,0], 'b': 1, 'r': []}] + out['4|madd9']
missing = [k for k, v in out.items() if not v and k.count('|') == 1]
print('positions', tot, 'rejected', bad, 'missing', missing)
json.dump(out, open(os.path.join(ROOT, 'docs/data/chords.json'), 'w'), separators=(',', ':'))
print(len(out), os.path.getsize(os.path.join(ROOT, 'docs/data/chords.json')))
