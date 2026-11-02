# Deterministic "education game of the day" roller for /build-education-game (and /build-game-for-mam).
# Usage: python3 roll.py YYYY-MM-DD [age] [hint words...] [--salt table=r1 ...] [--no-history]
#   age  3..7 (default 4); hint words filter a table (e.g. "space", "memory", "count");
#   --salt mechanic=r1 re-rolls one table (e.g. a second game on the same date: --salt mechanic=b).
#
# Variety rule (added 2026-11-02 after feedback: "the game keeps dropping something into a basket"):
#   mechanics are grouped into FAMILIES. The roller reads the Mechanic column of EDUCATION_GAMES.md and
#   GAMES_FOR_MAM.md and never picks a family used by any of the last 3 games, and allows the
#   'container' family (drag/drop/catch something INTO something) at most once in the last 6 games.
#   Themes and helpers used in the last 5 games are skipped too. Pass --no-history to ignore the index.
import hashlib, sys, json, os, re

args = sys.argv[1:]
date = args.pop(0)
salts, rest, use_history = {}, [], True
while args:
    a = args.pop(0)
    if a == '--salt' and args:
        k, _, v = args.pop(0).partition('=')
        salts[k] = v
    elif a == '--no-history':
        use_history = False
    else:
        rest.append(a)
age = 4
if rest and rest[0].isdigit():
    age = int(rest.pop(0))
hint = ' '.join(rest).lower()

# family → mechanics (each mechanic: short name, how it plays, how a topic maps onto it)
MECHANICS = [
    # container: put the answer into something (used a lot already → rationed)
    ('container', 'sort into baskets: drag items to the matching basket'),
    ('container', 'feed the animal: drag the right food into its open mouth'),
    ('container', 'train ride: load the right cargo onto the train cars'),
    ('container', 'garden: plant seeds in the right pots and watch them grow'),
    ('container', 'catch the falling answer with a basket'),
    ('container', 'dress-up: drag the right hat/scarf/shoes onto the helper (colours, counting buttons, sizes)'),
    # tap / pop
    ('pop', 'balloon pop: tap the balloon with the right answer'),
    ('pop', 'bubble bath: pop bubbles in the right order (1-2-3, A-B-C, small to big)'),
    ('pop', 'fishing: tap the fish that carries the answer as it swims by'),
    ('pop', 'peekaboo: animals pop up from holes, tap the one that matches'),
    # find / seek
    ('seek', 'hide-and-seek: friends hide behind bushes/doors; tap to peek and find the one asked for'),
    ('seek', 'treasure dig: tap the sand to find the answer'),
    ('seek', 'odd one out: a row of things, tap the one that does not belong'),
    # memory
    ('memory', 'memory cards: flip two cards to find matching pairs (colour↔colour, number↔dots, letter↔picture)'),
    # trace / draw
    ('trace', 'trace it: follow the glowing path with a finger to draw the letter, number or shape'),
    ('trace', 'connect the dots: tap or draw 1→2→3 (or A→B→C) to reveal a picture'),
    ('trace', 'paint the picture: tap each part of a line drawing to fill it with the colour asked for'),
    # music
    ('music', 'copy my tune: animals play a xylophone pattern, the child repeats it (count the notes, colour keys)'),
    ('music', 'animal band: tap the drum as many times as the number / when the right animal sings'),
    # path / move
    ('path', 'stepping stones: hop across the river by tapping the next stone in order'),
    ('path', 'maze ride: steer a little car/boat with a finger along the road to the right answer'),
    ('path', 'rocket launch: tap the right planet/star to fly the rocket there; collect the answers in order'),
    # build / puzzle
    ('build', 'build a tower: stack the right blocks; the tower wobbles with real physics'),
    ('build', 'jigsaw: drag pieces into the matching shadow to complete a picture'),
]
FAMILY_KEYWORDS = [   # how a free-text Mechanic column maps back to a family (first match wins)
    ('memory', ['memory', 'flip']), ('trace', ['trace', 'connect', 'paint', 'draw']), ('music', ['tune', 'xylophone', 'drum', 'music', 'rhythm', 'band']),
    ('path', ['stepping', 'stone', 'maze', 'rocket']), ('build', ['tower', 'stack', 'jigsaw', 'puzzle']),
    ('seek', ['hide', 'peek', 'dig', 'odd one']), ('pop', ['pop', 'fishing', 'peekaboo', 'whack']),
    ('container', ['sort', 'nest', 'basket', 'catch', 'feed', 'cargo', 'plant', 'pot', 'chest', 'into', 'dress']),
]
T = {
    'theme': ['sunny farm', 'under the sea', 'outer space', 'jungle', 'rainy-day garden', 'toy room',
              'arctic', 'candy village', 'dinosaur valley', 'fairy forest', 'busy city street', 'desert oasis',
              'bakery kitchen', 'mountain camping', 'rainbow cloud land', 'pirate island'],
    'helper': ['a baby elephant', 'a little bear', 'a duckling', 'a bunny', 'a panda', 'a kitten',
               'an owl', 'a baby turtle', 'a puppy', 'a little monkey', 'a hedgehog', 'a baby fox',
               'a little penguin', 'a giraffe calf', 'a tiny dragon', 'a koala'],
    'weather': ['sunny → breezy → rain → rainbow', 'morning → noon → sunset → starry night',
                'spring → summer → autumn → winter'],
}
SKILLS = {
    3: ['colours', 'shapes', 'big and small', 'animals'],
    4: ['colours', 'shapes', 'counting 1-5', 'animals'],
    5: ['counting 1-10', 'letters A-Z', 'shapes', 'more or less'],
    6: ['counting 1-20', 'adding within 10', 'letters A-Z', 'first words'],
    7: ['adding within 20', 'taking away within 10', 'first words', 'telling time'],
}


def families_of(text):
    """every family a free-text mechanic touches (e.g. 'dig + sort into chests' → seek and container)"""
    t = text.lower()
    return [fam for fam, kws in FAMILY_KEYWORDS if any(k in t for k in kws)]


def family_of(text):
    f = families_of(text)
    return '+'.join(f) if f else None


def history():
    """[(date, mechanic text, theme text, name)] of past games, oldest first, from both indexes."""
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, '..', '..', '..'))
    rows = []
    for f in ['EDUCATION_GAMES.md', 'GAMES_FOR_MAM.md']:
        p = os.path.join(root, 'projects', 'education-game', f)
        if not os.path.exists(p):
            continue
        for line in open(p, encoding='utf-8'):
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if len(cells) < 4 or not re.match(r'\d{4}-\d\d-\d\d', cells[0]):
                continue
            rows.append((cells[0][:10], cells[2], cells[3], cells[1]))
    seen, out = set(), []
    for r in sorted(rows, key=lambda r: r[0]):
        if r[3] in seen:          # a Mầm game listed in both files counts once
            continue
        seen.add(r[3]); out.append(r)
    return [r for r in out if r[0] <= date]


def h(k):
    return int(hashlib.sha256(f'{date}|{k}|{salts.get(k, "")}'.encode()).hexdigest(), 16)


def pick(k, opts, avoid=()):
    hits = [o for o in opts if hint and any(w in o for w in hint.split())]
    if hits:
        opts = hits
    keep = [o for o in opts if not any(a and a in o.lower() for a in avoid)]
    opts = keep or opts
    return opts[h(k) % len(opts)]


hist = history() if use_history else []
recent3 = [f for r in hist[-3:] for f in families_of(r[1])]
recent6 = [f for r in hist[-6:] for f in families_of(r[1])]
banned = set(recent3)
if 'container' in recent6:
    banned.add('container')
cands = [m for f, m in MECHANICS if f not in banned]
hits = [m for m in cands if hint and any(w in m for w in hint.split())]
cands = hits or cands or [m for _, m in MECHANICS]
mech = cands[h('mechanic') % len(cands)]
recent_text = ' '.join((r[2] + ' ' + r[3]).lower() for r in hist[-5:])
theme_avoid = [t for t in T['theme'] if t.split()[-1] in recent_text]
helper_avoid = [x.split()[-1] for x in T['helper'] if x.split()[-1] in recent_text]

r = {
    'mechanic': mech,
    'family': family_of(mech),
    'theme': pick('theme', T['theme'], theme_avoid),
    'helper': pick('helper', T['helper'], helper_avoid),
    'weather': pick('weather', T['weather'], [w for w in T['weather'] if hist and w.split()[0] in hist[-1][2].lower()]),
    'age': age,
    'skills': SKILLS[max(3, min(7, age))],
    'avoided_families': sorted(banned),
    'recent_games': [f'{d} {n} [{family_of(m)}]' for d, m, _, n in hist[-6:]],
}
print(json.dumps(r, indent=1, ensure_ascii=False))
