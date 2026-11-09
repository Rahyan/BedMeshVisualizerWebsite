# Firmware output fixtures

These tests replay public printer reports from the official firmware repositories. They validate parsing, numerical preservation and statistics against reported output; they are **not live hardware validation**, certification of a printer, or confirmation that a reported mesh accurately measured a bed. Sources were reviewed on 2026-11-06.

## Capture provenance

All files are under `tests/fixtures/`. Numeric spelling, cell order and grid shape are retained. Excerpts omit discussion, account names, attachments, unrelated commands, machine-position footers and other surrounding logs. Markdown quotation/code fences are removed and line endings normalized to LF. No device identifiers or private configuration are included.

| Fixture | Primary source and status | Extraction |
| --- | --- | --- |
| `marlin-21185-bilinear-3x3.txt` | [Marlin issue #21185](https://github.com/MarlinFirmware/Marlin/issues/21185), 2021-02-25: user-reported bilinear output, firmware version unspecified. | First 3×3 grid only, including host prefixes and numbered axes. The source has no title for this grid; none was added. |
| `marlin-9529-bilinear-4x4.txt` | [Marlin issue #9529](https://github.com/MarlinFirmware/Marlin/issues/9529), 2018-02-07: user-reported Marlin 1.1.8 output. | First of two 4×4 grids, with title, host prefixes and labels. |
| `prusa-1281-g81-3.1.3.txt` | [Prusa-Firmware issue #1281](https://github.com/prusa3d/Prusa-Firmware/issues/1281), comment dated 2018-12-08: reported MK3 G81 output labeled 3.1.3. | Complete 7×7 numeric excerpt; no preamble was supplied. |
| `prusa-1281-g81-3.5.0.txt` | Same [Prusa issue/comment](https://github.com/prusa3d/Prusa-Firmware/issues/1281): second output labeled 3.5.0. | Complete second 7×7 numeric excerpt; no preamble was supplied. |
| `klipper-2594-probed-3x3.txt` | [Klipper issue #2594](https://github.com/Klipper3d/klipper/issues/2594), 2020-03-06: user-reported terminal output, firmware version unspecified. | Probed 3×3 section only, retaining its heading and nested host prefixes. |
| `klipper-2594-interpolated-7x7.txt` | Same [Klipper report](https://github.com/Klipper3d/klipper/issues/2594): firmware-interpolated 7×7 section. | Its dimensions, metadata and full grid; repeated host prefixes removed. These are not 49 independent probe readings. |
| `klipper-docs-generated-coordinates.txt` | [Official Klipper output documentation](https://www.klipper3d.org/Bed_Mesh.html#output): documentation example, **not a printer capture**. | Heading and first two coordinate records, sufficient to verify rejection of an X/Y table as Z heights. |

Repository code-license references: [Marlin GPLv3 text](https://github.com/MarlinFirmware/Marlin/blob/bugfix-2.1.x/LICENSE), [Prusa-Firmware GPLv3 text](https://github.com/prusa3d/Prusa-Firmware/blob/MK3/LICENSE), and [Klipper GPLv3 text](https://github.com/Klipper3d/klipper/blob/master/COPYING). This identifies repository licensing context; it does not assume that issue-author discussion inherits that license. Fixtures retain numerical facts and the short protocol labels needed to test them, without copying discussion or complete logs.

## Interpretation and boundaries

- The actual Prusa excerpts are plain matrices, so the parser correctly reports `Plain grid`; firmware identity comes from provenance. One test adds a clearly synthetic host/timestamp wrapper and a preamble based on the official [mesh output implementation](https://github.com/prusa3d/Prusa-Firmware/blob/MK3/Firmware/mesh_bed_leveling.cpp). Its chosen search height is not an observation from the issue.
- A reported grid need not contain only directly probed values. Prusa's [mesh implementation](https://github.com/prusa3d/Prusa-Firmware/blob/MK3/Firmware/mesh_bed_leveling.cpp) includes upsampling. The fixtures establish output compatibility, not probe density or bed accuracy.
- These Prusa captures concern legacy MK3 firmware. [Legacy G81 documentation](https://help.prusa3d.com/article/prusa-firmware-specific-g-code-commands_112173) and the separate [Buddy command reference](https://help.prusa3d.com/article/buddy-firmware-specific-g-code-commands_633112) describe different firmware families. This suite does not establish compatibility with every MINI, MK4, XL or newer model's output.
- The Klipper issue contains both grids in one terminal report. Tests accept either section alone and reject the combined report, including equal-width variants. The two source sections also print opposite Y orders. Parsing preserves the pasted order; orientation changes require the explicit flip controls.
- Current Klipper [documentation](https://www.klipper3d.org/Bed_Mesh.html#output) and [command implementation](https://github.com/Klipper3d/klipper/blob/master/klippy/extras/bed_mesh.py) distinguish generated X/Y probe locations from a Z mesh. The historical command shown in the issue is not a promise of current parameter behavior. The coordinate-table fixture must fail with a targeted explanation.
- Unknown labels, partial grids, multiple named reports, non-finite heights and ragged rows remain errors. We do not infer an origin, silently select a grid, interpolate missing points or treat coordinate pairs as heights. A bare concatenation of unlabeled equal-width grids has no reliable report boundary; paste only one grid.

Run `node --test tests/mesh-data.test.mjs` for these regressions or `php scripts/check-release.php` for the application release checks. Tests make no network requests and require no printer or database.
