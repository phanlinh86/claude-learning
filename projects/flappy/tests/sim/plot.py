#!/usr/bin/env python3
"""Plots for docs/reports/playtest_report.md from tests/sim/results/*.json.
usage: python3 tests/sim/plot.py   (from projects/flappy)"""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "results")
OUT = os.path.join(HERE, "..", "..", "docs", "reports", "img")
os.makedirs(OUT, exist_ok=True)

# reference palette (dataviz skill): categorical slots 1-4, light mode
C = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
INK, INK2, GRID, SURF = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"
plt.rcParams.update({"font.size": 10, "text.color": INK, "axes.labelcolor": INK2, "xtick.color": INK2,
                     "ytick.color": INK2, "axes.edgecolor": GRID, "figure.facecolor": SURF, "axes.facecolor": SURF})


def load(v):
    p = os.path.join(RES, v + ".json")
    if not os.path.exists(p):
        return None
    d = json.load(open(p))
    return {(r["preset"], r["player"]): r["summary"] for r in d["results"]}


LABEL = {"bot:0.2": "bot 0.2", "bot:0.4": "bot 0.4", "bot:0.6": "bot 0.6", "bot:0.8": "bot 0.8", "bot:1": "bot 1.0",
         "kid:young": "young kid", "kid": "kid", "adult": "casual adult", "spam:3": "spam 3 Hz",
         "spam:5": "spam 5 Hz", "spam:8": "spam 8 Hz", "hugger": "ceiling hugger", "hoverspam": "hover spam"}


def hbars(fname, title, xlabel, players, series, metric, preset, band=None, fmt="{:.0f}"):
    """series: list of (variant, legend label)."""
    data = [(lbl, load(v)) for v, lbl in series]
    data = [(l, d) for l, d in data if d]
    n = len(data)
    fig, ax = plt.subplots(figsize=(8, 0.45 * len(players) * max(1, n) / 1.6 + 1.4))
    h = 0.8 / n
    if band:
        ax.axvspan(band[0], band[1], color="#1baf7a", alpha=0.12, lw=0)
        ax.text(band[0] + 1, -0.75, "target %d–%d s" % band, color=INK2, fontsize=9, va="center")
    for i, (lbl, d) in enumerate(data):
        ys = [k + (i - (n - 1) / 2) * h for k in range(len(players))]
        vals = [(d.get((preset, p)) or {}).get(metric) for p in players]
        vv = [v if v is not None else 0 for v in vals]
        ax.barh(ys, vv, height=h * 0.86, color=C[i], label=lbl, edgecolor=SURF, linewidth=1)
        for y, v in zip(ys, vals):
            ax.text((v or 0) + 0.6, y, "–" if v is None else fmt.format(v), va="center", fontsize=8, color=INK2)
    ax.set_yticks(range(len(players)))
    ax.set_yticklabels([LABEL.get(p, p) for p in players])
    ax.invert_yaxis()
    ax.set_xlabel(xlabel)
    ax.set_title(title, loc="left", fontsize=12, color=INK)
    ax.grid(axis="x", color=GRID, lw=0.8)
    ax.set_axisbelow(True)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.legend(frameon=False, loc="lower right", fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, fname), dpi=110)
    plt.close(fig)
    print("wrote", fname)


ALL = ["bot:0.4", "bot:0.6", "bot:1", "kid:young", "kid", "adult", "spam:3", "spam:5", "spam:8", "hugger"]
hbars("ppm_normal.png", "Points per minute on Normal: spamming vs aiming", "points per minute of play", ALL,
      [("baseline", "current build"), ("recommended", "recommended (config)"), ("recommendedPlus", "recommended + mechanics")],
      "ppm", "normal")
hbars("kid_survival_easy.png", "Easy: how long a kid's round lasts (median)", "seconds (median round length)",
      ["kid:young", "kid", "adult", "bot:0.4", "bot:0.6"],
      [("baseline", "current build"), ("easyFloat", "Easy floatier physics"), ("recommended", "recommended (config)"),
       ("recommendedPlus", "recommended + 3 hearts")], "timeMed", "easy", fmt="{:.0f}")
hbars("season_length_normal.png", "Normal: seconds each season lasts (median)", "seconds per season",
      ["bot:0.6", "bot:1", "adult", "spam:5", "hugger"],
      [("baseline", "current build"), ("recommended", "recommended (config)"), ("recommendedPlus", "recommended + mechanics")],
      "seasonLenMed", "normal", band=(45, 90))
