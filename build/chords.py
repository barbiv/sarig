"""Chord parsing + classification shared by the data build.
Maps Harte / free-form chord symbols to (root, quality index, bass) using a fixed
quality vocabulary that the app also knows (see src/theory.js QUALITIES)."""
import re

NOTES = {'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4', '7sus4', 'dim', 'dim7',
             'm7b5', 'aug', '6', 'm6', 'add9', '9', 'maj9', 'm9', 'madd9', '5',
             'mMaj7', '7#9', '7b9', '13', '6/9', 'aug7', '7b5']
QI = {q: i for i, q in enumerate(QUALITIES)}
NQ = len(QUALITIES)

DEG = {'1':0,'b1':11,'#1':1,'bb2':0,'b2':1,'2':2,'#2':3,'b3':3,'3':4,'#3':5,'b4':4,'4':5,'#4':6,
       'b5':6,'5':7,'#5':8,'b6':8,'6':9,'#6':10,'bb7':9,'b7':10,'7':11,'#7':0,
       'b9':13,'9':14,'#9':15,'b11':16,'11':17,'#11':18,'b13':20,'13':21,'#13':22}
SH = {
    'maj':[0,4,7],'min':[0,3,7],'dim':[0,3,6],'aug':[0,4,8],'maj7':[0,4,7,11],'min7':[0,3,7,10],
    '7':[0,4,7,10],'dim7':[0,3,6,9],'hdim7':[0,3,6,10],'minmaj7':[0,3,7,11],'maj6':[0,4,7,9],
    'min6':[0,3,7,9],'9':[0,4,7,10,14],'maj9':[0,4,7,11,14],'min9':[0,3,7,10,14],'sus4':[0,5,7],
    'sus2':[0,2,7],'11':[0,4,7,10,14,17],'min11':[0,3,7,10,14,17],'13':[0,4,7,10,14,21],
    'maj13':[0,4,7,11,14,21],'min13':[0,3,7,10,14,21],'1':[0],'5':[0,7],'':[0,4,7],
}


def parse_root(s):
    if not s or s[0] not in NOTES:
        return None, s
    r = NOTES[s[0]]
    i = 1
    while i < len(s) and s[i] in '#b':
        r += 1 if s[i] == '#' else -1
        i += 1
    return r % 12, s[i:]


def classify(iv):
    """iv: set of semitone intervals (may include >11 for extensions)."""
    s = set(iv)
    pc = {x % 12 for x in s}
    has = lambda *xs: any(x in s for x in xs)
    maj3 = 4 in pc
    min3 = 3 in pc and not maj3
    b7 = 10 in pc
    M7 = 11 in pc
    b5 = 6 in s or 18 in s and not 7 in s
    s5 = 8 in s and 7 not in s
    nine = has(2, 14)
    if not maj3 and not min3:
        if 5 in pc or 17 in s:
            return '7sus4' if b7 else 'sus4'
        if 2 in pc:
            return 'sus2'
        return '5'
    if min3:
        if 6 in pc and 7 not in pc:
            if 9 in s and not b7:
                return 'dim7'
            if b7:
                return 'm7b5'
            return 'dim'
        if M7:
            return 'mMaj7'
        if b7:
            return 'm9' if nine else 'm7'
        if 9 in s or 21 in s:
            return 'm6'
        if nine:
            return 'madd9'
        return 'm'
    # major third
    if s5:
        return 'aug7' if b7 else 'aug'
    if b7:
        if 15 in s or (3 in s):
            return '7#9'
        if 13 in s or 1 in s:
            return '7b9'
        if 21 in s or 9 in s:
            return '13'
        if 6 in s and 7 not in s:
            return '7b5'
        if nine:
            return '9'
        return '7'
    if M7:
        return 'maj9' if nine else 'maj7'
    if 9 in s or 21 in s:
        return '6/9' if nine else '6'
    if nine:
        return 'add9'
    return ''


def parse_harte(v):
    """Returns (root, qidx, bass) or None for no-chord."""
    v = v.strip()
    if v in ('N', 'X', '') or v.startswith('N'):
        return None
    if ':' in v:
        rs, rest = v.split(':', 1)
        root, junk = parse_root(rs)
        if root is None:
            return None
    else:
        root, rest = parse_root(v)
        if root is None:
            return None
        if rest.startswith('/') or rest == '':
            rest = 'maj' + rest
    bass = None
    if '/' in rest:
        rest, b = rest.rsplit('/', 1)
        if b in DEG:
            bass = (root + DEG[b]) % 12
        else:
            br, _ = parse_root(b)
            if br is not None:
                bass = br
    m = re.match(r'^([a-z0-9]*)(\((.*)\))?$', rest)
    if not m:
        return root, 0, bass
    sh = m.group(1)
    if m.group(3) is not None and sh == '':
        iv = {0}
    else:
        iv = set(SH.get(sh, [0, 4, 7]))
    if m.group(3):
        for d in m.group(3).split(','):
            d = d.strip()
            if not d:
                continue
            if d.startswith('*'):
                x = DEG.get(d[1:])
                if x is not None:
                    iv.discard(x)
                    iv.discard(x % 12)
            else:
                x = DEG.get(d)
                if x is not None:
                    iv.add(x)
        if sh == '' and not ({3, 4, 5, 2} & {x % 12 for x in iv}) and 7 in iv:
            pass
    q = classify(iv)
    if bass == root:
        bass = None
    return root, QI[q], bass


def chord_id(root, qi, bass=None):
    base = root * NQ + qi
    return base if bass is None else base + 12 * NQ * (bass + 1)


NAMES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
NAMES_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']


def name(cid):
    base = cid % (12 * NQ)
    bass = cid // (12 * NQ) - 1
    r, q = divmod(base, NQ)
    s = NAMES_SHARP[r] + QUALITIES[q]
    if bass >= 0:
        s += '/' + NAMES_SHARP[bass]
    return s


# Guitar-friendliness. Open-position chords that need no barre.
OPEN = {'C','A','G','E','D','Am','Em','Dm','E7','A7','D7','G7','C7','B7','Cmaj7','Fmaj7','Amaj7',
        'Dmaj7','Gmaj7','Emaj7','Am7','Em7','Dm7','Asus2','Asus4','Dsus2','Dsus4','Esus4','Cadd9',
        'E5','A5','D5','G5','A7sus4','E7sus4','D7sus4','G6','C6','A6','D6','E6','Am6','Dm6','Em6',
        'Caug','Gadd9','Dadd9','Eadd9','Aadd9','Em9','Am9','Fmaj9', 'Cmaj9','Gsus4','Csus2','Csus4',
        'Asus2','Esus2','Emadd9','Amadd9', 'E9', 'B7sus4'}
BASIC_Q = {0: 'maj', 1: 'm', 2: '7', 3: 'maj', 4: 'm', 5: 'maj', 6: 'maj', 7: '7', 8: 'dim', 9: 'dim',
           10: 'dim', 11: 'aug', 12: 'maj', 13: 'm', 14: 'maj', 15: '7', 16: 'maj', 17: 'm', 18: 'm',
           19: 'maj', 20: 'm', 21: '7', 22: '7', 23: '7', 24: 'maj', 25: '7', 26: '7'}
EXT_Q = {3,7,9,10,11,15,16,17,20,21,22,23,24,25,26}  # "advanced" chord colours


def chord_cost(cid):
    """0 = open/easy, 1 = barre-ish triad/7th, 2 = extended/jazz colour."""
    base = cid % (12 * NQ)
    r, q = divmod(base, NQ)
    nm = NAMES_SHARP[r] + QUALITIES[q]
    if nm in OPEN:
        return 0
    if q in EXT_Q:
        return 2
    if nm in ('F', 'Fmaj7') or q == 19:
        return 1
    return 1


def shape_open(root, qi):
    return (NAMES_SHARP[root] + QUALITIES[qi]) in OPEN
