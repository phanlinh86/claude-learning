"""Reads tests/out/visual/measure.jsonl and prints the layout findings (touch sizes, font sizes, clipping, overlaps,
   items / mounds outside the play band or overlapping, Tutu vs panels).   python3 -I tests/visual/analyze.py [filter]"""
import json, os, sys
F = os.path.join(os.path.dirname(__file__), '..', 'out', 'visual', 'measure.jsonl')
flt = sys.argv[1] if len(sys.argv) > 1 else ''
def ov(a, b, pad=0):
    if not a or not b: return 0
    w = min(a['r'], b['r']) - max(a['l'], b['l']) + pad; h = min(a['b'], b['b']) - max(a['t'], b['t']) + pad
    return (round(w, 1), round(h, 1)) if w > 0 and h > 0 else 0
rows = [json.loads(l) for l in open(F) if l.strip()][::-1]   # last capture of a shot wins
seen = set()
find = {}
def add(k, msg):
    find.setdefault(k, []).append(msg)
for d in rows:
    if flt and flt not in d['shot']: continue
    if d['shot'] in seen: continue
    seen.add(d['shot'])
    s = d['shot']
    for b in d['buttons']:
        if min(b['w'], b['h']) < 44: add('touch<44', f"{s}: {b['id']} '{b['txt']}' {b['w']}x{b['h']}")
    for t in d['smallText']:
        add('font<15', f"{s}: {t['id']} '{t['txt'][:40]}' {t['fs']}px")
    for o in d['overflow']:
        add('overflow', f"{s}: {o}")
    for o in d['offscreen']:
        add('offscreen', f"{s}: {o}")
    if d.get('bubble') and d.get('hud'):
        o = ov(d['bubble'], d['hud'])
        if o: add('bubble-hud', f"{s}: overlap {o} bubble={d['bubble']} hud={d['hud']}")
        if d['bubbleScrollH'] > d['bubbleClientH'] + 1: add('bubble-clip', f"{s}: scrollH {d['bubbleScrollH']} > clientH {d['bubbleClientH']} font {d['bubbleFont']:.1f} '{d['bubbleText']}'")
        if d['bubbleFont'] < 15: add('font<15', f"{s}: bubble {d['bubbleFont']:.1f}px '{d['bubbleText']}'")
        if d['bubble']['r'] > d['vw'] - 4: add('offscreen', f"{s}: bubble right {d['bubble']['r']} > vw {d['vw']}")
        if d.get('bubbleLines', 0) > 3: add('bubble-lines', f"{s}: {d['bubbleLines']} lines font {d['bubbleFont']:.1f} '{d['bubbleText']}'")
    if d.get('tutu'):
        tu = d['tutu']
        for key in ('talkPanel', 'donePanel'):
            p = d.get(key)
            if p:
                o = ov(tu, p)
                if o: add('tutu-panel', f"{s}: Tutu {tu} vs {key} {p} overlap {o}")
        if d.get('bubble'):
            o = ov(tu, d['bubble'])
            if o and o[0] > 2: add('tutu-bubble', f"{s}: Tutu {tu} vs bubble {d['bubble']} overlap {o}")
    if d.get('lagoons'):
        L = d['lagoons']
        for a in L:
            box = {'l': min(a['badge']['l'], a['nameBox']['l']), 'r': max(a['badge']['r'], a['nameBox']['r']), 't': a['badge']['t'], 'b': (a['stars'] or a['nameBox'])['b']}
            a['box'] = box
            if d.get('mapTop') and ov(box, d['mapTop']): add('map-badge-topbar', f"{s}: lagoon {a['id']} {box} vs top bar {d['mapTop']} overlap {ov(box, d['mapTop'])}")
            if d.get('resumeBar') and ov(box, d['resumeBar']): add('map-badge-resume', f"{s}: lagoon {a['id']} {box} vs resume bar {d['resumeBar']} overlap {ov(box, d['resumeBar'])}")
            if a['lines'] > 1: add('map-name-wrap', f"{s}: lagoon {a['id']} '{a['name']}' {a['lines']} lines @ {a['nameFs']:.1f}px (badge w {a['badge']['w']})")
            if a['nameFs'] < 15: add('font<15', f"{s}: lagoon name '{a['name']}' {a['nameFs']:.1f}px")
            if box['l'] < 0 or box['r'] > d['vw'] or box['t'] < 0 or box['b'] > d['vh']: add('offscreen', f"{s}: lagoon {a['id']} {box} vw {d['vw']} vh {d['vh']}")
            if a['locked'] and not a['lockNatural']: add('icons', f"{s}: lock icon not loaded on lagoon {a['id']}")
            if a['trophy'] and not a['trophyNatural']: add('icons', f"{s}: trophy icon not loaded on lagoon {a['id']}")
            if not a['badgeNatural']: add('icons', f"{s}: badge not loaded on lagoon {a['id']}")
        for i in range(len(L)):
            for j in range(i + 1, len(L)):
                o = ov(L[i]['box'], L[j]['box'])
                if o: add('map-badge-badge', f"{s}: lagoon {L[i]['id']} {L[i]['box']} vs {L[j]['id']} {L[j]['box']} overlap {o}")
    if d.get('trophySlots'):
        for t in d['trophySlots']:
            if t['nameW'] > t['cellW'] + 1: add('overflow', f"{s}: treasure cell '{t['name']}' text {t['nameW']} > cell {t['cellW']}")
            if t['lines'] > 2: add('treasure-wrap', f"{s}: '{t['name']}' {t['lines']} lines, cell w {t['w']}")
    if d.get('panel') and d['panel']['scrollH'] > d['panel']['clientH'] + 2: add('panel-scroll', f"{s}: {d['panel']['id']} content {d['panel']['scrollH']} > visible {d['panel']['clientH']} (needs scroll)")
    if d.get('talkPanel') and d['talkPanel']['scrollH'] > d['talkPanel']['clientH'] + 2: add('panel-scroll', f"{s}: talk panel content {d['talkPanel']['scrollH']} > visible {d['talkPanel']['clientH']}")
    if d.get('logo') and d['logo']['sw'] > d['logo']['cw'] + 1: add('overflow', f"{s}: logo {d['logo']}")
    if d.get('logo') and (d['logo']['l'] < 0 or d['logo']['r'] > d['vw']): add('offscreen', f"{s}: logo {d['logo']}")
    if d.get('items'):
        P = d['play']; s_ = d['view']['s']
        its = [i for i in d['items'] if i['state'] in ('idle',)]
        for i in its:
            r = {'l': i['cx'] - i['size'] / 2, 'r': i['cx'] + i['size'] / 2, 't': i['cy'] - i['size'] / 2, 'b': i['cy'] + i['size'] / 2}
            if r['l'] < P['l'] - 10 or r['r'] > P['r'] + 10 or r['t'] < P['t'] - 10 or r['b'] > P['b'] + 10:   # 10 px: idle bob + pack jitter add('item-outside-play', f"{s}: item {i['id']} {i['sprite'] or i['shape']} rect {r} play {P}")
            if i['sizeLogical'] < 100: add('item<100', f"{s}: item {i['id']} {i['sprite'] or i['shape']} drawn {i['sizeLogical']} logical px (touch r {i['touchLogical']})")
            if r['l'] < 0 or r['r'] > d['vw'] or r['t'] < 0 or r['b'] > d['vh']: add('offscreen', f"{s}: item {i['id']} {r}")
            for c in d['chests']:
                o = ov(r, c)
                if o: add('item-chest', f"{s}: item {i['id']} {r} overlaps chest {c['id']} {o}")
            if d.get('hud') and ov(r, d['hud']): add('item-hud', f"{s}: item {i['id']} overlaps HUD {ov(r, d['hud'])}")
            if d.get('bubble') and ov(r, d['bubble']): add('item-bubble', f"{s}: item {i['id']} overlaps bubble {ov(r, d['bubble'])}")
        for a in range(len(its)):
            for b in range(a + 1, len(its)):
                A, B = its[a], its[b]
                dist = ((A['cx'] - B['cx']) ** 2 + (A['cy'] - B['cy']) ** 2) ** .5
                need = 0.5 * (A['size'] + B['size'])
                if dist < need * 0.92: add('item-item', f"{s}: items {A['id']}/{B['id']} centre dist {dist:.0f} < {need:.0f} (sizes {A['size']},{B['size']})")
        M = d.get('mounds') or []
        for m in M:
            if m['l'] < 0 or m['r'] > d['vw'] or m['t'] < 0 or m['b'] > d['vh']: add('offscreen', f"{s}: mound {m['id']} {m}")
            for c in d['chests']:
                o = ov(m, c)
                if o: add('mound-chest', f"{s}: mound {m['id']} {m} overlaps chest {c['id']} {c} {o}")
            if d.get('bubble') and ov(m, d['bubble']): add('mound-bubble', f"{s}: mound {m['id']} overlaps bubble {ov(m, d['bubble'])}")
            if d.get('tutu') and ov(m, d['tutu']): add('mound-tutu', f"{s}: mound {m['id']} overlaps Tutu {ov(m, d['tutu'])}")
            if m['wLogical'] < 130: add('mound-small', f"{s}: mound w {m['wLogical']}")
        for a in range(len(M)):
            for b in range(a + 1, len(M)):
                o = ov(M[a], M[b])
                if o: add('mound-mound', f"{s}: mounds {M[a]['id']}/{M[b]['id']} overlap {o}")
        # buried items (poke-out) vs bubble / HUD
        for i in d['items']:
            if i['state'] == 'buried':
                r = {'l': i['cx'] - i['size'] / 2, 'r': i['cx'] + i['size'] / 2, 't': i['cy'] - i['size'] / 2, 'b': i['cy']}
                if d.get('bubble') and ov(r, d['bubble']): add('item-bubble', f"{s}: buried item {i['id']} overlaps bubble {ov(r, d['bubble'])}")
                if d.get('hud') and ov(r, d['hud']): add('item-hud', f"{s}: buried item {i['id']} overlaps HUD {ov(r, d['hud'])}")
                if i['sizeLogical'] < 100: add('item<100', f"{s}: buried item {i['id']} {i['sprite'] or i['shape']} drawn {i['sizeLogical']} logical px")
        for c in d['chests']:
            if c['wLogical'] < 170 and c['kind'] == 'chest': add('chest-small', f"{s}: chest {c['id']} w {c['wLogical']}")
for k in sorted(find):
    print(f"\n== {k} ({len(find[k])})")
    for m in find[k][:400]: print('  ' + m)
