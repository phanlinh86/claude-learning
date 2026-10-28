# industry-career-analysis scripts

Python scripts that turn the research agents' findings into the three PDF reports.

## Layout
```
src/
├── common.py           # shared ReportLab styles + helpers (tables, KPI tiles, callouts, charts, header/footer)
├── requirements.txt
└── runs/<date>-<industry>/
    ├── build_report1_market.py     # Report 1: market & competitors
    ├── build_report2_companies.py  # Report 2: companies analysis
    ├── build_report3_career.py     # Report 3: working at the companies + recommendation
    ├── research/       # raw markdown reports from the research agents (with sources)
    └── output/         # the generated PDFs
```

## Run
```
pip install -r requirements.txt
python runs/2026-10-hdd/build_report1_market.py
python runs/2026-10-hdd/build_report2_companies.py
python runs/2026-10-hdd/build_report3_career.py
```
PDFs go to that run's `output/` folder. Needs DejaVu fonts (`fonts-dejavu` on Linux).

## New run
Copy the most recent run folder, rename it (`<yyyy-mm>-<industry>`), replace `research/` with the new agents' reports, and update the numbers and wording inside the three build scripts.

## Runs
| Folder | Industry | Person |
|---|---|---|
| `2026-10-hdd` | HDD (Seagate, Western Digital, Toshiba; competitors SSD/NAND, tape) | 15-year HDD servo engineer |
| `2026-10-factory-automation` | Factory automation (Siemens, Schneider, ABB, Rockwell, Emerson, Honeywell, Fanuc, Keyence, Yaskawa, Mitsubishi Electric, Omron, Inovance) | Senior corporate-strategy professional, 15 years, global |
