<?php
declare(strict_types=1);

return [
    'reading-a-mesh' => [
        'title' => 'Reading a bed mesh',
        'description' => 'Understand height range, orientation, fitted tilt, and the variation that remains in your measured bed mesh.',
        'summary' => 'Read the surface, understand the numbers, and separate overall tilt from the shape that remains.',
        'label' => 'Understand the surface',
        'sections' => [
            'measured-grid' => 'Start with the grid',
            'mesh-statistics' => 'Read the numbers',
            'tilt-and-shape' => 'Separate tilt from shape',
            'choose-a-view' => 'Choose a view',
        ],
    ],
    'getting-mesh-data' => [
        'title' => 'Getting your mesh data',
        'description' => 'Find the right mesh output for your firmware, preserve the numeric grid, and bring it into Bed Mesh.',
        'summary' => 'Find the right output for your firmware and bring a complete, unaltered height grid into the visualizer.',
        'label' => 'From printer to input',
        'sections' => [
            'firmware-output' => 'Find your firmware output',
            'preserve-the-grid' => 'Preserve the grid',
            'check-your-input' => 'Load and check it',
            'keep-the-source' => 'Keep the source',
        ],
    ],
    'comparing-runs' => [
        'title' => 'Comparing two mesh runs',
        'description' => 'Compare bed mesh measurements using consistent probing conditions, matched chart scales, and original-data statistics.',
        'summary' => 'Keep the conditions consistent and use matching scales to see what changed between measurements.',
        'label' => 'Measure the change',
        'sections' => [
            'consistent-runs' => 'Keep runs comparable',
            'matching-scales' => 'Match scales and references',
            'read-the-change' => 'Read the change',
            'save-the-comparison' => 'Save a useful record',
        ],
    ],
    'bed-mesh-repeatability' => [
        'title' => 'How to test 3D printer bed mesh repeatability',
        'description' => 'Run three unchanged bed meshes, measure point-by-point spread, and check whether a bed adjustment exceeds your observed variation.',
        'summary' => 'Measure how much your bed mesh varies between unchanged scans, then use that baseline to interpret an adjustment.',
        'label' => 'Check your probing setup',
        'sections' => [
            'repeatable-conditions' => 'Keep the setup fixed',
            'build-a-baseline' => 'Build a repeatability baseline',
            'repeatability-example' => 'Work through an example',
            'probe-vs-mesh' => 'Isolate probe and whole-bed variation',
        ],
    ],
    'cold-vs-heated-bed-mesh' => [
        'title' => 'How to compare a cold and heated 3D printer bed mesh',
        'description' => 'Probe the same grid cold and at print temperature, then use a difference heatmap to separate a height shift from a change in shape.',
        'summary' => 'Compare the same probe points before and after heating. Find out whether the entire mesh shifted or the bed changed shape.',
        'label' => 'Measure the effect of heat',
        'sections' => [
            'control-conditions' => 'Set up the cold and heated runs',
            'compare-temperature' => 'Compare the same points',
            'read-thermal-patterns' => 'Separate offset, tilt and shape',
            'choose-print-condition' => 'Use the results for your next print',
        ],
    ],
    'uneven-first-layer-flat-mesh' => [
        'title' => 'Why your first layer is uneven even when the bed mesh looks flat',
        'description' => 'Check whether mesh compensation is active, then use a one-layer test, your Z offset, and matched mesh scales to narrow down the cause.',
        'summary' => 'Check which mesh your print uses, then distinguish a whole-bed nozzle gap problem from a problem in one area.',
        'label' => 'Troubleshoot the first layer',
        'sections' => [
            'verify-mesh-in-use' => 'Check the mesh used by the print',
            'match-physical-location' => 'Match the symptom to a bed location',
            'test-one-layer' => 'Read a one-layer test',
            'narrow-down' => 'Change one thing and test again',
        ],
    ],
    'how-flat-should-a-3d-printer-bed-be' => [
        'title' => 'How flat does a 3D printer bed need to be?',
        'description' => 'See what a 0.2 mm bed mesh range means and compare a steady slope, a bowl and a single high point before deciding what to adjust.',
        'summary' => 'Compare three meshes with a 0.2 mm range and see what their different shapes tell you about the next check.',
        'label' => 'Interpret your height range',
        'sections' => [
            'is-point-two-enough' => 'Is 0.2 mm good enough?',
            'same-range-different-shapes' => 'Same range, three shapes',
            'check-first-layer' => 'Decide with a first-layer test',
        ],
    ],
    'bed-mesh-flipped' => [
        'title' => 'Why does my 3D printer bed mesh look flipped?',
        'description' => 'Map a Bed Mesh heatmap to the front, left and right of your printer using the sampled coordinates, axis flips and the front-edge label.',
        'summary' => 'Use firmware coordinates and a labelled heatmap to find the physical corner that a high or low point represents.',
        'label' => 'Locate the physical corner',
        'sections' => [
            'find-printer-directions' => 'Find the printer’s directions',
            'align-and-label' => 'Align and label the heatmap',
            'verify-corner' => 'Verify the corner',
        ],
    ],
    'klipper-adaptive-mesh-3x3' => [
        'title' => 'Why does Klipper probe 3×3 when I set 5×5?',
        'description' => 'Understand why a Klipper adaptive mesh can use a smaller grid, how to verify what area it sampled, and when to use full-bed scans for comparison.',
        'summary' => 'Check whether adaptive meshing changed the footprint and point count, then pick comparable scans for before and after measurements.',
        'label' => 'Understand adaptive grids',
        'sections' => [
            'why-grid-changes' => 'Why the grid changes',
            'read-adapted-bounds' => 'Read the actual sampled bounds',
            'collect-matching-scans' => 'Collect two matching scans',
        ],
    ],
    'bed-mesh-spike' => [
        'title' => 'One point is high on my bed mesh. Is the spike real?',
        'description' => 'Use three repeat bed scans to tell a transient high reading from a feature that repeats at the same position, then check the likely causes.',
        'summary' => 'Repeat the same grid and check whether the spike stays in one place before making a physical adjustment.',
        'label' => 'Investigate a high point',
        'sections' => [
            'find-measured-point' => 'Check the measured point',
            'repeat-the-grid' => 'Repeat the same grid',
            'check-repeatable-spike' => 'Investigate a repeatable spike',
        ],
    ],
];
