# Search house

Claude skills that act as a local real-estate agent: they collect current listings, filter them by your criteria, send research agents to check each home's nearest grocery store, school, hospital, safety and hazards, then deliver an Excel workbook and a PDF recommendation (1 main pick, top 10 alternatives, listings to avoid).

## Skills
| Skill | Use it for |
|---|---|
| `search-house` | Any city or region – e.g. US Bay Area, other countries |
| `search-nha-sai-gon` | Ho Chi Minh City (Vietnamese portals, ward mergers, sổ hồng / hoàn công checks) |

## How to run
Open Claude Code in this folder (`projects/search-house/`) so the project skills load, then ask, for example:

```
Use the search-house skill.
Location: Sunnyvale, Mountain View or Santa Clara, CA
Size: at least 1,400 sq ft living area
Budget: 2,000,000 USD
Type: single-family house, 3+ bedrooms, 2+ baths, garage
```

```
Use the search-nha-sai-gon skill.
Location: Quận 3 (alley houses OK)
Area: more than 50 m²
Budget: 300,000 USD
Type: single-family house, at least 3 bedrooms, car access preferred
```

A run takes about 10–15 minutes.

## Files
- `.claude/skills/search-house/SKILL.md` – general skill
- `.claude/skills/search-nha-sai-gon/SKILL.md` – Ho Chi Minh City skill
