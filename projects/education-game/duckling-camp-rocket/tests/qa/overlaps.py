# Geometric overlap check over the geo-*.json written by tests/qa/visual.js (logical px; DOM rects converted).
#   python3 tests/qa/overlaps.py
import json, glob, os, collections
ROOT = os.path.join(os.path.dirname(__file__), '..', 'out', 'qa_visual')
def inter(a, b, gap=0):
    return a['x'] < b['x'] + b['w'] + gap and b['x'] < a['x'] + a['w'] + gap and a['y'] < b['y'] + b['h'] + gap and b['y'] < a['y'] + a['h'] + gap
def foot(m, L):
    S = L['S'] * m['ds']; ih = L['itemH'] * m['ds']
    return {'x': m['x'] - S / 2, 'y': m['y'] - ih, 'w': S, 'h': ih + 0.21 * S + 6}
def dom(e, r):
    if not r or not r.get('vis'): return None
    s = e['s']; return {'x': (r['x'] - e['left']) / s, 'y': (r['y'] - e['top']) / s, 'w': r['w'] / s, 'h': r['h'] / s, 'op': r.get('op', 1)}
issues = collections.Counter(); ex = {}
stats = collections.defaultdict(list)
for f in glob.glob(os.path.join(ROOT, '*', 'geo-*.json')):
    for e in json.load(open(f)):
        if 'layout' not in e: continue
        L = e['layout']; dev = e['shot'].split('-en-')[0].split('-vi-')[0]
        pole = L.get('poleBox'); pump = L['pump']; pad = L['pad']
        pumpB = {'x': pump['x'] - 60, 'y': pump['y'] - 20, 'w': 120, 'h': 90}
        padB = {'x': pad['x'] - 40, 'y': pad['y'] - 140, 'w': 80, 'h': 150}
        mh = L['mimiH']; mi = L['mimiHome']; mimiB = {'x': mi['x'] - 0.33 * mh, 'y': mi['y'] - mh, 'w': 0.66 * mh, 'h': mh}
        bub = dom(e, e['dom'].get('bubble')); hud = dom(e, e['dom'].get('hud'))
        for m in e['mats']:
            if m['state'] in ('fold', 'gone', 'hidden'): continue
            F = foot(m, L)
            stats[dev].append((m['S'], F['y'], L['meadow']['y1'] if 'meadow' in L else 0))
            for name, B, g in [('pole', pole, 0), ('pump', pumpB, 0), ('pad', padB, 0), ('mimi', mimiB, 0), ('bubble', bub, 0), ('hud', hud, 0)]:
                if B and inter(F, B, g):
                    k = f'{dev}: mat vs {name}'; issues[k] += 1; ex.setdefault(k, e['shot'])
            for p in e['props']:
                if inter(F, p['box']):
                    k = f"{dev}: mat vs {p['kind']}"; issues[k] += 1; ex.setdefault(k, e['shot'])
        r = e.get('rocket')
        if r and r['state'] in ('chute', 'coast', 'boost') and bub and r.get('top') is not None:
            if r['top'] < bub['y'] + bub['h'] and r['noseX'] > bub['x'] - 60 and r['noseX'] < bub['x'] + bub['w'] + 60:
                k = f"{dev}: rocket/chute under bubble (bubble opacity {bub['op']:.2f})"; issues[k] += 1; ex.setdefault(k, e['shot'])
        if r and r['state'] in ('chute', 'coast') and hud and r.get('top') is not None and inter({'x': r['noseX'] - 60, 'y': r['top'], 'w': 120, 'h': 60}, hud):
            k = f"{dev}: rocket/chute under HUD (opacity {hud['op']:.2f})"; issues[k] += 1; ex.setdefault(k, e['shot'])
for k, v in sorted(issues.items()): print(f'{v:4d}  {k}   e.g. {ex[k]}')
for d, v in stats.items():
    import statistics
    print(d, 'mats', len(v), 'mat width logical median', round(statistics.median(x[0] for x in v)), 'min', round(min(x[0] for x in v)))
