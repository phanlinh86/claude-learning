# search-house scripts

Python scripts that build the Excel shortlist and the PDF recommendation for each house-search run. The skills (`../.claude/skills/`) collect listings and research each home; these scripts turn the results into files.

## Layout
```
src/
├── fonts.py            # finds a font with Vietnamese diacritics (DejaVu Sans or Arial)
├── requirements.txt
└── runs/<date>-<area>/
    ├── data.py         # listings, research results, scores and report wording for that run
    ├── build_xlsx.py   # writes the Excel workbook (Read me, Websites, All listings, Shortlist)
    ├── build_pdf.py    # writes the PDF (pick, top 10, surroundings, avoid list, checklist)
    ├── reports/        # raw notes from the research agents
    └── output/         # the generated .xlsx and .pdf
```

## Run
```
pip install -r requirements.txt
python runs/2026-10-bayarea-santaclara/build_xlsx.py
python runs/2026-10-bayarea-santaclara/build_pdf.py
```
Files go to that run's `output/` folder (or pass an output path as the first argument). Formulas in the workbook calculate when you open it in Excel.

## New run
Copy the most recent run folder that matches the market (Vietnam or US), rename it, then replace `data.py` with the new listings and research. The build scripts usually need only title/label tweaks.

## Runs
| Folder | Search |
|---|---|
| `2026-10-hcmc-d10-thuduc` | Ho Chi Minh City, near District 10 or Thủ Đức, > 50 m², ≤ US$300k |
| `2026-10-hcmc-quan3` | Quận 3, > 50 m², 3+ bedrooms, ≤ US$300k |
| `2026-10-bayarea-santaclara` | Santa Clara / Sunnyvale / Mountain View / North San Jose, 1,400+ sq ft, 3 bd / 2 ba, garage, ≤ $2M, < 20 min to Marvell |
