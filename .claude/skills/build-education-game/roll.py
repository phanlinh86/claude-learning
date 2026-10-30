# Deterministic "education game of the day" roller for /build-education-game.
# Usage: python3 roll.py YYYY-MM-DD [age] [hint words...] [--salt table=r1 ...]
#   age  3..7 (default 4); hint words filter a table (e.g. "space", "fishing", "count");
#   --salt mechanic=r1 re-rolls one table (use when it repeats a recent game).
import hashlib, sys, json

args = sys.argv[1:]
date = args.pop(0)
salts = {}
rest = []
while args:
    a = args.pop(0)
    if a == '--salt' and args:
        k, _, v = args.pop(0).partition('=')
        salts[k] = v
    else:
        rest.append(a)
age = 4
if rest and rest[0].isdigit():
    age = int(rest.pop(0))
hint = ' '.join(rest).lower()

T = {
    'mechanic': [
        'balloon pop: tap the balloon with the right answer',
        'feed the animal: drag the right food into its mouth',
        'sort into baskets: drag items to the matching basket',
        'catch the falling answer with a basket',
        'fishing: tap the fish that carries the answer',
        'train ride: load the right cargo onto the train cars',
        'garden: plant and grow N flowers',
        'bubble bath: pop bubbles in the right order',
        'build a tower: stack the right block',
        'treasure dig: tap the sand to find the answer',
    ],
    'theme': ['sunny farm', 'under the sea', 'outer space', 'jungle', 'rainy-day garden', 'toy room',
              'arctic', 'candy village', 'dinosaur valley', 'fairy forest'],
    'helper': ['a baby elephant', 'a little bear', 'a duckling', 'a bunny', 'a panda', 'a kitten',
               'an owl', 'a baby turtle', 'a puppy', 'a little monkey'],
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


def pick(k, opts):
    hits = [o for o in opts if hint and any(w in o for w in hint.split())]
    if hits:
        opts = hits
    h = int(hashlib.sha256(f'{date}|{k}|{salts.get(k, "")}'.encode()).hexdigest(), 16)
    return opts[h % len(opts)]


r = {k: pick(k, T[k]) for k in T}
r['age'] = age
r['skills'] = SKILLS[max(3, min(7, age))]
print(json.dumps(r, indent=1, ensure_ascii=False))
