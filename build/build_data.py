#!/usr/bin/env python3
"""Builds the song library for the app from open datasets:
 - McGill Billboard (CC0) — audio-aligned chords, measures, sections
 - ChoCo (CC BY 4.0): Isophonics, USPOP2002, Robbie Williams (audio-aligned),
   Rock Corpus, iReal Pro, Wikifonia, BiaB (symbolic, beat-based)
 - curated_*.txt — hand-authored progressions (Hebrew + extras)
Outputs public/data/index.json and public/data/s/<chunk>.json
"""
import csv, json, os, re, glob, math, collections, statistics, sys, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
from chords import parse_harte, chord_id, NQ, QI, chord_cost, name, parse_root, QUALITIES, NAMES_SHARP

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw')
CHOCO = os.path.join(RAW, 'choco', 'partitions')
OUT = os.path.join(ROOT, 'docs', 'data')
CHUNK = 400

GENRES = ['רוק', 'פופ', 'בלדה', 'פולק ואקוסטי', 'קאנטרי', 'בלוז', 'ג׳אז', 'סול ו-R&B',
          'פאנק ודיסקו', 'לטיני ובוסה נובה', 'רגאיי', 'בלוגראס', 'גוספל ו-Worship',
          'ים-תיכוני ומזרחית', 'שירי ארץ ישראל', 'פסקול ומחזות זמר', 'לא מסווג', 'רוק ישראלי', 'פופ ישראלי']
G = {g: i for i, g in enumerate(GENRES)}
GENRE_RULES = [
    (('bluegrass', 'fiddle', 'old-time', 'clawhammer', 'old time'), 'בלוגראס'),
    (('worship', 'gospel', 'hymn', 'christian'), 'גוספל ו-Worship'),
    (('reggae', 'ska', 'calypso'), 'רגאיי'),
    (('disco', 'funk', 'dance', 'club'), 'פאנק ודיסקו'),
    (('soul', 'r&b', 'rnb', "r'n'b", 'rhythm & blues', 'motown', 'doo wop', 'doo-wop'), 'סול ו-R&B'),
    (('blues', 'shuffle'), 'בלוז'),
    (('country',), 'קאנטרי'),
    (('folk',), 'פולק ואקוסטי'),
    (('bossa', 'samba', 'latin', 'bolero', 'tango', 'salsa', 'son', 'choro', 'afro', 'mambo', 'cha',
      'merengue', 'baião', 'baiao', 'afoxe', 'balada', 'rumba', 'mpb', 'frevo', 'partido', 'cumbia',
      'bachata', 'guajira', 'beguine', 'cuban'), 'לטיני ובוסה נובה'),
    (('soundtrack', 'musical', 'broadway', 'show tune'), 'פסקול ומחזות זמר'),
    (('rock', 'punk', 'metal', 'grunge', 'new wave', 'alternative', 'rockabilly', "rock'n'roll"), 'רוק'),
    (('pop', 'even 8', 'even 16', 'chanson', 'adult contemporary', 'easy listening', 'oldies', 'vocal', 'electro'), 'פופ'),
    (('ballad',), 'בלדה'),
    (('swing', 'bop', 'jazz', 'waltz', 'dixieland', 'gypsy', 'fusion', 'modal', 'medium', 'up tempo', 'two-four', 'stride', 'ragtime'), 'ג׳אז'),
]


def genre_of(s):
    s = (s or '').lower()
    if not s:
        return None
    for keys, g in GENRE_RULES:
        for k in keys:
            if k == 'son' or k == 'cha':
                if re.search(r'\b' + k + r'\b', s):
                    return g
            elif k in s:
                return g
    return None


def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r'\(.*?\)|\[.*?\]', ' ', s)
    s = s.replace('&', ' and ')
    s = re.sub(r"[^a-z0-9֐-׿]+", ' ', s)
    s = re.sub(r'\b(the|a|an)\b', ' ', s)
    return ' '.join(s.split())


def artist_key(a):
    toks = sorted(t for t in norm(a).split() if len(t) > 1)
    return ' '.join(toks)


def clean_title(t, src):
    t = (t or '').strip()
    t = re.sub(r'\s+', ' ', t)
    if src.startswith('ireal'):
        t = re.sub(r'\s*\[#\]\s*', '', t)
        t = re.sub(r'\s+-\s+[^-]{2,40}$', '', t)  # " - Arranger" suffix
        t = re.sub(r'\s+\d$', '', t)
    return t.strip(' -')


def fix_ireal_artist(a):
    a = (a or '').strip()
    if a in ('Composer Unknown', 'be2sharp ARR:', 'Charts Practice', 'NG', 'Exercise', 'RichieVitale.com', '', 'Patterns For Jazz', 'Iglesia'):
        return ''
    if a == 'Traditional':
        return 'Traditional'
    m = re.match(r'^(.*) \((.*)\)$', a)
    if m and m.group(1).lower().startswith('the '):
        return m.group(1)
    parts = a.split()
    if len(parts) == 2 and not a.lower().startswith('the ') and ',' not in a:
        return parts[1] + ' ' + parts[0]
    return a


LATIN_ARTISTS = ('jobim', 'djavan', 'veloso', 'pixinguinha', 'lins', 'nascimento', 'gil', 'buarque', 'bosco',
                 'baden', 'lobo', 'valle', 'powell', 'gismonti', 'páez', 'paez', 'sosa', 'piazzolla', 'cartola',
                 'houghton', 'iglesia', 'ferro', 'sanz', 'bebel', 'carlos', 'marisa', 'lenine', 'noel rosa')


def lang_of(title, artist, genre):
    if re.search(r'[֐-׿]', title + artist):
        return 0
    if genre == 'לטיני ובוסה נובה':
        return 2
    if re.search(r'[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]', title + artist):
        return 2
    if re.search(r'[áéíóúãõçñâêôàèìòùüöäß¿¡]', (title + ' ' + artist).lower()):
        return 2
    al = artist.lower()
    if any(x in al for x in LATIN_ARTISTS):
        return 2
    return 1


def parse_key(v):
    if not v:
        return -1
    v = v.strip()
    if v == 'N':
        return -1
    minor = 0
    if ':' in v:
        r, m = v.split(':', 1)
        minor = 1 if m.startswith('min') or m in ('aeolian', 'dorian', 'phrygian') else 0
    else:
        r = v.split()[0]
        if r.endswith('-') and len(r) <= 3:
            minor = 1
            r = r[:-1]
        if 'minor' in v:
            minor = 1
    root, _ = parse_root(r)
    if root is None:
        return -1
    return root * 2 + minor


songs = []  # dicts


def add(**kw):
    songs.append(kw)


# ---------------------------------------------------------------- Billboard
def parse_bars(txt):
    """Return list of bars; each bar = list of tokens (chords or '.') and meter override."""
    bars = []
    rep = 1
    m = re.search(r'\|\s*x(\d+)', txt)
    if m:
        rep = int(m.group(1))
    segs = re.findall(r'\|([^|]*)(?=\|)', txt)
    for sgm in segs:
        s = sgm.strip()
        if not s or re.fullmatch(r'x\d+.*', s):
            continue
        meter = None
        mm = re.match(r'\((\d+)/(\d+)\)\s*(.*)', s)
        if mm:
            meter = (int(mm.group(1)), int(mm.group(2)))
            s = mm.group(3)
        toks = s.split()
        if not toks:
            continue
        bars.append((toks, meter))
    return bars * rep


def beats_in(meter):
    n, d = meter
    if d == 8 and n % 3 == 0:
        return n // 3
    return n


def load_billboard():
    idx = {}
    with open(os.path.join(RAW, 'billboard', 'billboard-2.0-index.csv')) as f:
        for r in csv.DictReader(f):
            if r['title']:
                idx[int(r['id'])] = r
    ab_genre = {}
    for i in idx:
        p = os.path.join(RAW, 'billboard', 'billboard-2.0-acousticbrainz', '%04d' % i, 'acousticbrainz.json')
        if os.path.exists(p):
            try:
                t = json.load(open(p))['metadata'].get('tags', {})
                for g in t.get('genre', []):
                    gg = genre_of(g)
                    if gg:
                        ab_genre[i] = gg
                        break
            except Exception:
                pass
    by_artist = collections.defaultdict(collections.Counter)
    for i, g in ab_genre.items():
        by_artist[artist_key(idx[i]['artist'])][g] += 1
    for i, r in idx.items():
        p = os.path.join(RAW, 'billboard', 'billboard-2.0-salami_chords', '%04d' % i, 'salami_chords.txt')
        if not os.path.exists(p):
            continue
        lines = open(p).read().splitlines()
        meter = (4, 4)
        tonic = None
        rows = []
        for ln in lines:
            if ln.startswith('#'):
                if ln.startswith('# metre:'):
                    try:
                        a, b = ln.split(':')[1].strip().split('/')
                        meter = (int(a), int(b))
                    except Exception:
                        pass
                if ln.startswith('# tonic:'):
                    tonic = ln.split(':', 1)[1].strip()
                continue
            if '\t' not in ln:
                continue
            t, c = ln.split('\t', 1)
            try:
                rows.append((float(t), c))
            except ValueError:
                pass
        events, beats, downs, secs = [], [], [], []
        cur_meter = meter
        end = rows[-1][0] if rows else 0
        for k, (t0, c) in enumerate(rows):
            t1 = rows[k + 1][0] if k + 1 < len(rows) else t0
            ms = re.match(r'^([A-Z]\'*),\s*([a-zA-Z \-]+),', c)
            if ms:
                lab = ms.group(2).strip()
                if lab not in ('silence', 'end'):
                    secs.append([round(t0 * 100), lab])
            if '|' not in c:
                if c.strip().startswith(('silence', 'end', 'Z')):
                    events.append([round(t0 * 100), -1])
                continue
            bars = parse_bars(c)
            if not bars:
                continue
            bd = (t1 - t0) / len(bars)
            prev = None
            for bi, (toks, mo) in enumerate(bars):
                bm = mo or cur_meter
                bs = t0 + bi * bd
                nb = beats_in(bm)
                downs.append(len(beats))
                for j in range(nb):
                    beats.append(round((bs + bd * j / nb) * 100))
                for j, tk in enumerate(toks):
                    if tk == '.':
                        continue
                    pr = parse_harte(tk)
                    cid = chord_id(*pr) if pr else -1
                    events.append([round((bs + bd * j / len(toks)) * 100), cid])
        # merge repeated chords
        merged = []
        for e in events:
            if merged and merged[-1][1] == e[1]:
                continue
            merged.append(e)
        if len([e for e in merged if e[1] >= 0]) < 3:
            continue
        g = ab_genre.get(i)
        if not g:
            c = by_artist.get(artist_key(r['artist']))
            g = c.most_common(1)[0][0] if c else None
        year = int(r['chart_date'][:4]) if r['chart_date'] else 0
        key = parse_key(tonic + ':maj') if tonic else -1
        bpm = 0
        if len(beats) > 8:
            diffs = [b - a for a, b in zip(beats, beats[1:]) if b > a]
            bpm = round(6000 / statistics.median(diffs)) if diffs else 0
        add(src='billboard', title=r['title'], artist=r['artist'], genre=g or 'פופ', year=year, key=key,
            bpm=bpm, bpb=beats_in(meter), timed=True, events=merged, end=round(end * 100), beats=beats,
            downs=downs, secs=secs, peak=int(r['peak_rank'] or 100), sid='bb%d' % i)


# ---------------------------------------------------------------- JAMS helpers
def jload(p):
    return json.load(open(p))


def ann(d, ns):
    for a in d['annotations']:
        if a['namespace'] == ns:
            return a['data']
    return None


def estimate_beats(events, end):
    """For chord-only timed annotations: fit a steady beat grid."""
    ds = [(b[0] - a[0]) / 100 for a, b in zip(events, events[1:]) if a[1] >= 0 and (b[0] - a[0]) > 25]
    if len(ds) < 4:
        return [], []
    best = None
    for pc in range(33, 101):
        p = pc / 100
        err = sum(abs(d / p - round(d / p)) * min(d, 4) for d in ds if round(d / p) >= 1) / len(ds)
        err += 0.02 * sum(1 for d in ds if round(d / p) < 1)
        # prefer slower (longer) periods slightly to avoid half-time aliasing
        score = err - 0.02 * p
        if best is None or score < best[0]:
            best = (score, p)
    p = best[1]
    start = next(e[0] for e in events if e[1] >= 0) / 100
    beats, downs = [], []
    t = start
    k = 0
    while t < end / 100:
        if k % 4 == 0:
            downs.append(len(beats))
        beats.append(round(t * 100))
        t += p
        k += 1
    return beats, downs


YEARS = {"Please Please Me": 1963, "With the Beatles": 1963, "A Hard Day's Night": 1964, "Beatles for Sale": 1964,
         "Help!": 1965, "Rubber Soul": 1965, "Revolver": 1966, "Sgt. Pepper's Lonely Hearts Club Band": 1967,
         "Magical Mystery Tour": 1967, "The Beatles CD1": 1968, "The Beatles CD2": 1968, "Abbey Road": 1969,
         "Let It Be": 1970, "Tapestry": 1971, "Carole King": 1971}
ARTIST_GENRE = {
    'The Beatles': 'רוק', 'Queen': 'רוק', 'Michael Jackson': 'פופ', 'Carole King': 'פופ', 'Zweieck': 'פופ',
    'Robbie Williams': 'פופ', 'Metallica': 'רוק', 'Nirvana': 'רוק', 'Oasis': 'רוק', 'Radiohead': 'רוק', 'Muse': 'רוק',
    'Coldplay': 'רוק', 'U2': 'רוק', 'Rem': 'רוק', 'Led Zeppelin': 'רוק', 'Deep Purple': 'רוק', 'Black Sabbath': 'רוק',
    'Ac Dc': 'רוק', 'Aerosmith': 'רוק', 'Van Halen': 'רוק', 'Bon Jovi': 'רוק', 'Doors': 'רוק', 'Rolling Stones': 'רוק',
    'Soundgarden': 'רוק', 'Temple Of The Dog': 'רוק', 'Weezer': 'רוק', 'Offspring': 'רוק', 'Blink 182': 'רוק',
    'Papa Roach': 'רוק', 'Incubus': 'רוק', 'Live': 'רוק', 'Garbage': 'רוק', 'Everclear': 'רוק', 'Goo Goo Dolls': 'רוק',
    'Third Eye Blind': 'רוק', '3 Doors Down': 'רוק', 'Foreigner': 'רוק', 'Kansas': 'רוק', 'Survivor': 'רוק',
    'Jimi Hendrix Experience': 'רוק', 'Dire Straits': 'רוק', 'Police': 'רוק', 'Tom Petty': 'רוק', 'Billy Idol': 'רוק',
    'Creedence Clearwater Revival': 'רוק', 'Genesis': 'רוק', 'Procol Harum': 'רוק', 'Presidents Of The United States Of America': 'רוק',
    'Sublime': 'רגאיי', 'Bob Marley': 'רגאיי', 'Shaggy': 'רגאיי', 'Fugees': 'סול ו-R&B', 'R Kelly': 'סול ו-R&B',
    'Stevie Wonder': 'סול ו-R&B', 'Whitney Houston': 'סול ו-R&B', 'Mariah Carey': 'פופ', 'Janet Jackson': 'פופ',
    'John Denver': 'קאנטרי', 'Leann Rimes': 'קאנטרי', 'Simon And Garfunkel': 'פולק ואקוסטי', 'Paul Simon': 'פולק ואקוסטי',
    'Cat Stevens': 'פולק ואקוסטי', 'Don Mclean': 'פולק ואקוסטי', 'Van Morrison': 'רוק', 'Eric Clapton': 'רוק',
    'Frank Sinatra': 'ג׳אז', 'Enya': 'פופ', 'Selena': 'לטיני ובוסה נובה', 'Ricky Martin': 'לטיני ובוסה נובה',
    'Elvis Presley': 'רוק', 'Everly Brothers': 'רוק', 'Roy Orbison': 'רוק', 'Joe Cocker': 'סול ו-R&B',
}


def load_timed_jams(part, src):
    meta = os.path.join(CHOCO, part, 'choco', 'meta.csv')
    for r in csv.DictReader(open(meta)):
        p = os.path.join(CHOCO, part, 'choco', 'jams', os.path.basename(r['jams_path'] or ''))
        if not os.path.isfile(p):
            continue
        d = jload(p)
        ch = ann(d, 'chord')
        if not ch:
            continue
        events = []
        for x in ch:
            pr = parse_harte(x['value'])
            cid = chord_id(*pr) if pr else -1
            t = round(x['time'] * 100)
            if events and events[-1][1] == cid:
                continue
            events.append([t, cid])
        end = round((d['file_metadata'].get('duration') or (ch[-1]['time'] + ch[-1]['duration'])) * 100)
        if len([e for e in events if e[1] >= 0]) < 3:
            continue
        beats, downs = [], []
        bt = ann(d, 'beat')
        if bt:
            for x in bt:
                if x['value'] == 1 or x['value'] == 1.0:
                    downs.append(len(beats))
                beats.append(round(x['time'] * 100))
        else:
            beats, downs = estimate_beats(events, end)
        secs = []
        sg = ann(d, 'segment_open')
        if sg:
            for x in sg:
                if x['value'] and x['value'].lower() not in ('silence', 'end'):
                    secs.append([round(x['time'] * 100), x['value'].lower()])
        km = ann(d, 'key_mode')
        key = parse_key(km[0]['value']) if km else -1
        artist = r['file_performer']
        title = r['file_title']
        year = 0
        if r.get('file_release_year'):
            try:
                year = int(r['file_release_year'])
            except ValueError:
                pass
        year = year or YEARS.get(r.get('file_release', ''), 0)
        bpm = 0
        if len(beats) > 8:
            diffs = [b - a for a, b in zip(beats, beats[1:]) if b > a]
            bpm = round(6000 / statistics.median(diffs))
        bpb = 4
        if bt and downs and len(downs) > 3:
            bpb = round(statistics.median([b - a for a, b in zip(downs, downs[1:])])) or 4
        add(src=src, title=title, artist=artist, genre=ARTIST_GENRE.get(artist, 'פופ'), year=year, key=key, bpm=bpm,
            bpb=bpb, timed=True, events=events, end=end, beats=beats, downs=downs, secs=secs, peak=100,
            sid='%s:%s' % (src, r['id']), release=r.get('file_release', ''))


# ---------------------------------------------------------------- symbolic
JUNK_T = re.compile(r'exercis|pattern|practice|scale|drill|etude|lesson|warm ?up|test chart|voicing|turnaround|ii-v|ii v|comping|blues in [a-g]', re.I)


def load_symbolic(part, sub, src, meta_fn):
    base = os.path.join(CHOCO, part, 'choco', sub) if sub else os.path.join(CHOCO, part, 'choco')
    for r in csv.DictReader(open(os.path.join(base, 'meta.csv'))):
        jp = os.path.basename(r['jams_path']).replace('.jams', '') + '.jams'
        p = os.path.join(base, 'jams-converted', jp)
        if not os.path.exists(p):
            p = os.path.join(base, 'jams', jp)
            if not os.path.exists(p):
                continue
        try:
            d = jload(p)
        except Exception:
            continue
        ch = ann(d, 'chord_harte')
        if not ch:
            continue
        m = meta_fn(r, d)
        if not m or not m['title'] or JUNK_T.search(m['title']):
            continue
        events = []
        for x in ch:
            du = x['duration']
            if not du or du <= 0:
                continue
            pr = parse_harte(x['value'])
            cid = chord_id(*pr) if pr else -1
            if events and events[-1][0] == cid:
                events[-1][1] += du
            else:
                events.append([cid, du])
        while events and events[0][0] < 0:
            events.pop(0)
        while events and events[-1][0] < 0:
            events.pop()
        if len(events) < 3 or len(set(e[0] for e in events)) < 2:
            continue
        ts = ann(d, 'timesig')
        bpb = 4
        if ts:
            try:
                bpb = beats_in((ts[0]['value']['numerator'], ts[0]['value']['denominator']))
            except Exception:
                pass
        km = ann(d, 'key_mode')
        key = parse_key(km[0]['value']) if km else -1
        for e in events:
            e[1] = round(e[1], 3)
        add(src=src, timed=False, events=events, bpb=bpb, key=key, peak=100, sid='%s:%s' % (src, r['id']), **m)


def m_ireal(r, d):
    style = r.get('genre', '')
    if style.startswith('Zz') or 'Renaissance' in style:
        style = ''
    artist = r.get('artists', '')
    if artist in ('Exercise', 'Charts Practice', 'Patterns For Jazz', 'RichieVitale.com', 'Fussenegger Gregor', 'Niehaus Lennie'):
        return None
    try:
        bpm = int(float(r.get('tempo') or 0))
    except ValueError:
        bpm = 0
    if bpm < 40 or bpm > 320:
        bpm = 0
    g = genre_of(style) or 'לא מסווג'
    return dict(title=clean_title(r['title'], 'ireal'), artist=fix_ireal_artist(artist), genre=g, year=0, bpm=bpm,
                style=style)


def m_wiki(r, d):
    a = r.get('score_composers') or r.get('file_authors') or ''
    return dict(title=(r.get('score_title') or r.get('file_title') or '').strip(), artist=a.strip(), genre='לא מסווג',
                year=0, bpm=0, style='')


def m_biab(r, d):
    t = (r.get('score_title') or '').strip()
    if not t:
        t = r['biab_id'].split('_id_')[0]
    return dict(title=t, artist=(r.get('score_authors') or '').strip(), genre='לא מסווג', year=0, bpm=0, style='')


def m_rock(r, d):
    y = 0
    try:
        y = int(float(r.get('release_year') or 0))
    except ValueError:
        pass
    return dict(title=r['title'], artist=r['performers'], genre='רוק', year=y, bpm=0, style='')


# ---------------------------------------------------------------- curated DSL
def parse_chord_sym(tok):
    """Free chord symbol like Am7, F#m7b5, Cmaj7/G, Bb, Dsus4, E5 -> cid"""
    tok = tok.strip()
    bass = None
    if '/' in tok and not tok.endswith('6/9'):
        tok, b = tok.split('/', 1)
        bass, _ = parse_root(b)
    root, rest = parse_root(tok)
    if root is None:
        raise ValueError('bad chord ' + tok)
    alias = {'': '', 'M': '', 'maj': '', 'min': 'm', '-': 'm', 'mi': 'm', 'M7': 'maj7', 'Maj7': 'maj7', 'ma7': 'maj7',
             'min7': 'm7', '-7': 'm7', 'ø': 'm7b5', 'ø7': 'm7b5', 'o': 'dim', 'o7': 'dim7', '+': 'aug', 'sus': 'sus4',
             '2': 'sus2', 'add2': 'add9', 'maj9': 'maj9', '7sus': '7sus4', 'm(add9)': 'madd9', 'add11': '', '4': 'sus4',
             'dim': 'dim', 'm7-5': 'm7b5', 'mmaj7': 'mMaj7', '7+': 'aug7', '+7': 'aug7', '11': '7sus4', 'm11': 'm7',
             'maj13': 'maj9', 'm13': 'm9', '69': '6/9', '7b13': '7', '7#5': 'aug7', '9sus4': '7sus4', 'm7add11': 'm7'}
    q = alias.get(rest, rest)
    if q not in QI:
        raise ValueError('bad quality %r in %s' % (rest, tok))
    if bass == root:
        bass = None
    return chord_id(root, QI[q], bass)


def load_curated(path, lang_default):
    if not os.path.exists(path):
        return
    txt = open(path, encoding='utf-8').read()
    for block in re.split(r'\n\s*\n', txt):
        lines = [l.rstrip() for l in block.strip().splitlines() if l.strip() and not l.strip().startswith('//')]
        if not lines or not lines[0].startswith('@'):
            continue
        head = [x.strip() for x in lines[0][1:].split('|')]
        title, artist, genre = head[0], head[1], head[2]
        meta = dict(x.split('=', 1) for x in head[3:] if '=' in x)
        bpm = int(meta.get('bpm', 90))
        bpb = int(meta.get('ts', 4))
        year = int(meta.get('y', 0))
        capo = int(meta.get('capo', 0))
        events, secs = [], []
        for ln in lines[1:]:
            if ':' in ln and not ln.startswith('|'):
                lab, prog = ln.split(':', 1)
                lab = lab.strip()
            else:
                lab, prog = None, ln
            rep = 1
            mm = re.search(r'\s+x(\d+)\s*$', prog)
            if mm:
                rep = int(mm.group(1))
                prog = prog[:mm.start()]
            bars = []
            for tk in re.findall(r'\[[^\]]*\]|\S+', prog):
                if tk.startswith('['):
                    inner = tk[1:-1].split()
                    n = len(inner)
                    for c in inner:
                        if ':' in c:
                            c, b = c.split(':')
                            bars.append((c, float(b)))
                        else:
                            bars.append((c, bpb / n))
                else:
                    if '*' in tk:
                        c, n = tk.split('*')
                        bars.append((c, bpb * float(n)))
                    elif ':' in tk:
                        c, b = tk.split(':')
                        bars.append((c, float(b)))
                    else:
                        bars.append((tk, bpb))
            if lab:
                secs.append([len(events), lab])
            for _ in range(rep):
                for c, b in bars:
                    if c in ('N', 'NC', '-'):
                        cid = -1
                    else:
                        cid = parse_chord_sym(c)
                    events.append([cid, b])
        # merge identical adjacent (keeps section boundaries)
        m2, sec_map, secset = [], {}, {s[0] for s in secs}
        for i, e in enumerate(events):
            if m2 and m2[-1][0] == e[0] and i not in secset:
                m2[-1][1] += e[1]
            else:
                sec_map[i] = len(m2)
                m2.append(list(e))
        secs2 = [[sec_map[s[0]], s[1]] for s in secs if s[0] in sec_map]
        key = -1
        if 'key' in meta:
            k = meta['key']
            minor = k.endswith('m')
            r, _ = parse_root(k.rstrip('m'))
            key = r * 2 + (1 if minor else 0)
        add(src='curated', title=title, artist=artist, genre=genre, year=year, key=key, bpm=bpm, bpb=bpb, timed=False,
            events=m2, secs=secs2, peak=100, sid='cur:' + norm(title), capo_hint=capo, curated=True,
            lang=0 if re.search(r'[֐-׿]', title) else lang_default)


# ---------------------------------------------------------------- run
def main():
    load_curated(os.path.join(ROOT, 'build', 'curated_he.txt'), 0)
    load_curated(os.path.join(ROOT, 'build', 'curated_en.txt'), 1)
    n0 = len(songs)
    load_billboard()
    print('billboard', len(songs) - n0)
    for part, src in (('isophonics', 'isophonics'), ('uspop2002', 'uspop'), ('robbie-williams', 'rw')):
        n0 = len(songs)
        load_timed_jams(part, src)
        print(part, len(songs) - n0)
    for part, sub, src, fn in (('rock-corpus', '', 'rockcorpus', m_rock), ('ireal-pro', 'playlists', 'ireal', m_ireal),
                               ('ireal-pro', 'forum', 'irealforum', m_ireal), ('wikifonia', '', 'wikifonia', m_wiki),
                               ('biab-internet-corpus', '', 'biab', m_biab)):
        n0 = len(songs)
        load_symbolic(part, sub, src, fn)
        print(part, sub, len(songs) - n0)

    # ---- popularity & dedupe
    PRI = {'curated': 0, 'isophonics': 1, 'billboard': 2, 'rw': 3, 'uspop': 4, 'rockcorpus': 5, 'ireal': 6,
           'irealforum': 7, 'wikifonia': 8, 'biab': 9}
    title_count = collections.Counter()
    for s in songs:
        s['nt'] = norm(s['title'])
        title_count[s['nt']] += 1
    groups = collections.defaultdict(list)
    for s in songs:
        ak = artist_key(s['artist'])
        groups[(s['nt'], ak)].append(s)
    # merge groups with unknown artist into a known-artist group with same title when unique
    by_title = collections.defaultdict(list)
    for k in groups:
        by_title[k[0]].append(k)
    final = []
    for k, lst in groups.items():
        if not k[0]:
            continue
        if k[1] == '' and len([x for x in by_title[k[0]] if x[1]]) >= 1:
            continue  # a version with a known artist exists
        def q(s):
            nev = len(s['events'])
            return (PRI[s['src']], 0 if s.get('bpm') else 1, -min(nev, 400))
        lst.sort(key=q)
        best = lst[0]
        best['versions'] = len(lst)
        final.append(best)
    print('after dedupe', len(final))

    # ---- stats
    for s in final:
        cids = [e[1] if s['timed'] else e[0] for e in s['events']]
        cids = [c for c in cids if c >= 0]
        base = [c % (12 * NQ) for c in cids]
        cnt = collections.Counter(base)
        s['uniq'] = [c for c, _ in cnt.most_common()]
        # difficulty
        costs = [chord_cost(c) for c in s['uniq']]
        n = len(s['uniq'])
        # duration & changes per minute
        if s['timed']:
            dur = s['end'] / 100
            nch = len(cids)
        else:
            beats = sum(e[1] for e in s['events'])
            bpm = s['bpm'] or 100
            dur = beats * 60 / bpm
            nch = len(cids)
        s['dur'] = round(dur)
        cpm = nch / max(dur / 60, 0.3)
        score = n * 0.6 + sum(costs) * 1.2 + max(0, cpm - 20) * 0.08
        s['diff'] = 1 if (max(costs, default=0) == 0 and n <= 6) else (3 if (score > 16 or costs.count(2) >= 3) else 2)
        # best capo (0..7): shapes = chord - capo; minimise cost
        best = None
        for capo in range(0, 8):
            c2 = [chord_cost(((c // NQ - capo) % 12) * NQ + c % NQ) for c in s['uniq']]
            val = sum(c2) * 10 + capo
            if best is None or val < best[0]:
                best = (val, capo, max(c2, default=0))
        s['capo'] = best[1]
        s['capo_easy'] = best[2] == 0
        s['nobarre'] = max(costs, default=0) == 0
        pop = title_count[s['nt']] + s.get('versions', 1)
        if s['genre'] in ('ג׳אז', 'לטיני ובוסה נובה', 'בלוגראס', 'לא מסווג', 'גוספל ו-Worship'):
            pop *= 0.4
        if s['src'] == 'billboard':
            pop += max(0, 100 - s['peak']) / 8
        if s['src'] in ('irealforum', 'wikifonia', 'biab'):
            pop *= 0.6
        pop += (6 if s['src'] in ('isophonics', 'curated') else 0) + (14 if s['timed'] else 0)
        s['pop'] = pop
        s['lang'] = s.get('lang', lang_of(s['title'], s['artist'], s['genre']))

    # sort: curated first, then by popularity desc
    final.sort(key=lambda s: (0 if s['src'] == 'curated' else 1, -s['pop'], s['title'].lower()))
    SRC = ['curated', 'billboard', 'isophonics', 'uspop', 'rw', 'rockcorpus', 'ireal', 'irealforum', 'wikifonia', 'biab']
    os.makedirs(os.path.join(OUT, 's'), exist_ok=True)
    for f in glob.glob(os.path.join(OUT, 's', '*.json')):
        os.remove(f)
    rows = []
    chunks = collections.defaultdict(dict)
    for i, s in enumerate(final):
        flags = (1 if s['timed'] else 0) | (2 if s.get('beats') else 0) | (4 if s['src'] == 'curated' else 0) \
            | (8 if s['nobarre'] else 0) | (16 if s['capo_easy'] else 0)
        chords = ''.join(base36(c) for c in s['uniq'])
        rows.append([i, s['title'], s['artist'], s['lang'], G[s['genre']], s['year'], s['key'], s['bpm'] or 0, s['bpb'],
                     flags, s['diff'], chords, s['capo'], round(s['pop'], 1), s['dur'], SRC.index(s['src']), stable_key(s)])
        if s['timed']:
            ev = s['events']
            data = {'e': delta_pairs(ev), 'end': s['end']}
            if s.get('beats'):
                data['b'] = delta(s['beats'])
                data['d'] = delta(s['downs'])
            if s.get('secs'):
                data['s'] = s['secs']
            if s.get('release'):
                data['r'] = s['release']
        else:
            data = {'e': [[e[0], e[1]] for e in s['events']]}
            if s.get('secs'):
                data['s'] = s['secs']
            if s.get('style'):
                data['st'] = s['style']
            if s.get('capo_hint'):
                data['ch'] = s['capo_hint']
        chunks[i // CHUNK][i] = data
    for c, d in chunks.items():
        with open(os.path.join(OUT, 's', '%d.json' % c), 'w') as f:
            json.dump(d, f, separators=(',', ':'), ensure_ascii=False)
    index = {'v': 1, 'chunk': CHUNK, 'genres': GENRES, 'q': QUALITIES, 'src': SRC, 'songs': rows}
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'), ensure_ascii=False)
    print('songs', len(rows), 'chunks', len(chunks))
    langs = collections.Counter(r[3] for r in rows)
    print('langs', langs)
    print('genres', collections.Counter(GENRES[r[4]] for r in rows).most_common())
    print('timed', sum(1 for r in rows if r[9] & 1))


def stable_key(s):
    import zlib
    h = zlib.crc32((s['sid'] + '|' + s['title']).encode('utf-8'))
    d = '0123456789abcdefghijklmnopqrstuvwxyz'
    out = ''
    while h:
        out = d[h % 36] + out
        h //= 36
    return out


def base36(n):
    d = '0123456789abcdefghijklmnopqrstuvwxyz'
    return d[n // 36] + d[n % 36]


def delta(a):
    out, p = [], 0
    for x in a:
        out.append(x - p)
        p = x
    return out


def delta_pairs(ev):
    out, p = [], 0
    for t, c in ev:
        out.append(t - p)
        out.append(c)
        p = t
    return out


if __name__ == '__main__':
    main()
