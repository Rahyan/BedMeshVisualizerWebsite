# Editorial image provenance

All four images in `assets/articles/` are screenshots of this project's local
visualizer, captured through the in-app browser on 2026-11-06. They contain no
administrator pages, private accounts, third-party photos, or actual user meshes.
The UI and plots are shown together where useful; captions identify the data as
simulated. These images illustrate the articles rather than claim hardware tests.

| Image | State and source |
| --- | --- |
| `visualizer-workspace.png` | Original-height 3D view, first example grid below; original statistics and input visible. |
| `mesh-difference.png` | After minus before, as measured; both example grids below, no dimensions, no flips. Symmetric signed scale. |
| `tilted-plane-measured.png` | Measured-height 3D view and expanded surface analysis for the tilted grid below; individual fitted scale. |
| `tilted-plane-residual.png` | Same tilted grid with Remove fitted tilt selected; original statistics remain unchanged. |

Before (mm):

```text
0.00 0.10 0.20
0.10 0.00 0.10
0.20 0.10 0.20
```

After (mm):

```text
0.02 0.08 0.12
0.07 0.02 0.06
0.12 0.07 0.11
```

Tilted plane (mm):

```text
0.00 0.05 0.10
0.00 0.05 0.10
0.00 0.05 0.10
```

PNG captures retain chart labels and interface context. When replacing one,
recapture its complete component through the browser, inspect it at article and
mobile sizes, and keep its caption/alt text consistent with the shown reference.
