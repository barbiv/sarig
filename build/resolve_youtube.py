#!/usr/bin/env python3
"""Find YouTube videos for songs (runs in GitHub Actions, which has open internet).
Writes docs/data/yt.json: { songKey: [[videoId, durationSec, isTopic, channel], ...up to 3] }"""
import json, os, re, sys, time, unicodedata
import yt_dlp

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'docs', 'data', 'index.json')
OUT = os.path.join(ROOT, 'docs', 'data', 'yt.json')
LIMIT = int(os.environ.get('YT_LIMIT', '2600'))
BUDGET = float(os.environ.get('YT_MINUTES', '300')) * 60

def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r'\(.*?\)|\[.*?\]', ' ', s)
    return ' '.join(re.sub(r"[^a-z0-9֐-׿]+", ' ', s).split())

BAD = ('live', 'cover', 'karaoke', 'lesson', 'tutorial', 'remix', 'instrumental', 'how to play', 'reaction', 'piano', 'guitar', '8d', 'slowed', 'sped up', 'nightcore', 'backing track')

def score(e, title, artist, dur):
    t = norm(e.get('title')); ch = (e.get('channel') or e.get('uploader') or '')
    chn = norm(ch)
    s = 0.0
    if ch.endswith(' - Topic'): s += 4
    if 'vevo' in chn: s += 1.5
    toks = [w for w in norm(title).split() if len(w) > 1]
    if toks: s += 3 * sum(1 for w in toks if w in t) / len(toks)
    atoks = [w for w in norm(artist).split() if len(w) > 2]
    if atoks: s += 2 * sum(1 for w in atoks if w in t or w in chn) / len(atoks)
    for b in BAD:
        if b in t and b not in norm(title): s -= 3
    d = e.get('duration') or 0
    if dur and d: s -= min(4, abs(d - dur) / 8)
    if d and (d < 60 or d > 900): s -= 4
    return s

def main():
    idx = json.load(open(IDX))
    have = json.load(open(OUT)) if os.path.exists(OUT) else {}
    rows = idx['songs']
    # priority: timed (flag 1), curated (flag 4), then by popularity; skip "unclassified" fakebook tunes
    def pri(r):
        flags = r[9]
        return (0 if flags & 4 else 1 if flags & 1 else 2, -r[13])
    todo = [r for r in sorted(rows, key=pri) if ('db:' + r[16]) not in have][:LIMIT]
    print('to resolve', len(todo), 'already', len(have), flush=True)
    ydl = yt_dlp.YoutubeDL({'quiet': True, 'skip_download': True, 'extract_flat': 'in_playlist', 'noplaylist': True})
    t0 = time.time(); done = 0; fails = 0
    for r in todo:
        if time.time() - t0 > BUDGET: break
        title, artist, dur = r[1], r[2] if r[2] not in ('Traditional', 'מסורתי', 'עממי', 'תרגול') else '', r[14] if r[9] & 1 else 0
        q = f'{artist} {title}'.strip() + ('' if re.search(r'[֐-׿]', title) else ' audio')
        try:
            info = ydl.extract_info(f'ytsearch6:{q}', download=False)
            ents = [e for e in (info.get('entries') or []) if e and e.get('id')]
            ents.sort(key=lambda e: -score(e, title, artist, dur))
            best = [[e['id'], int(e.get('duration') or 0), 1 if (e.get('channel') or '').endswith(' - Topic') else 0, (e.get('channel') or e.get('uploader') or '')[:40]]
                    for e in ents[:3] if score(e, title, artist, dur) > 1]
            if best: have['db:' + r[16]] = best
            done += 1
        except Exception as ex:
            fails += 1
            print('ERR', title, str(ex)[:120], flush=True)
            if fails > 40 and done < 5: break
            time.sleep(3)
        if done % 100 == 0:
            json.dump(have, open(OUT, 'w'), separators=(',', ':'), ensure_ascii=False)
            print(done, 'resolved', len(have), 'total', round(time.time() - t0), 's', flush=True)
        time.sleep(0.4)
    json.dump(have, open(OUT, 'w'), separators=(',', ':'), ensure_ascii=False)
    print('DONE resolved', done, 'fails', fails, 'total entries', len(have))

if __name__ == '__main__':
    main()
