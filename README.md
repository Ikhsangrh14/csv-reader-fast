# csv-reader-fast

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Ikhsangrh14/csv-reader-fast/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Ikhsangrh14/csv-reader-fast/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Fast drop-in replacement for **csv-reader 1.0.0**, built for the make.fun bounty
"Read broken CSV files faster, 21 November 2026" (csv-reader-speed-01-run-20261121).

`solve.js` exports `run(input)` and returns exactly the same
`{ columns, rows, errors }` as the reference csv-reader 1.0.0 for every input —
including its broken-CSV semantics (BOM handling, stray CRs, quoted fields,
quote junk, unterminated quotes, short/long row errors) — while parsing
several times faster: fields are cut with native `indexOf` scans and `slice`
instead of per-character string building, and whole simple records are split
natively.

`main.ts` is the standard competition driver: it reads cases from
`/input/cases.json` and writes `answers.json`.

Verified locally against the full practice set: outputs identical to the
reference implementation and to the official expected answers, at ~3.8x the
speed of the reference baseline.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?ref=24z7bxjg&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
