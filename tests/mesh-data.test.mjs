import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMesh, findMeshReports, calculateStats, analyzeMesh, removeFittedTilt, exportMeshCsv, transformMesh } from '../js/mesh-data.mjs';

const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be near ${expected}`);
const fixture = name => readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), 'utf8');

test('log scanning separates captured firmware grids and leaves coordinate tables out', () => {
	const marlin = fixture('marlin-21185-bilinear-3x3').trim();
	const probed = fixture('klipper-2594-probed-3x3').trim();
	const interpolated = fixture('klipper-2594-interpolated-7x7').trim();
	const log = [
		'Send: N24 G29*19', marlin, 'Recv: ok', 'Recv: T:55.2 B:60.1',
		probed, interpolated, fixture('klipper-docs-generated-coordinates'), 'Recv: ok',
	].join('\r\n');
	const { reports, skipped } = findMeshReports(log);
	assert.equal(skipped, 0);
	assert.deepEqual(reports.map(report => [report.format, report.columns, report.rows]), [
		['Marlin', 3, 3], ['Klipper', 3, 3], ['Klipper', 7, 7],
	]);
	assert.equal(reports[0].firstLine, 1);
	assert.equal(reports[1].label, 'Klipper probed Z');
	for (const [index, text] of [marlin, probed, interpolated].entries()) {
		assert.deepEqual(parseMesh(reports[index].raw).values, parseMesh(text).values);
	}
});

test('log scanning rejects incomplete sections without salvaging a misleading partial grid', () => {
	const log = [
		'Num X,Y: 3,3', '0.1 0.2 0.3', '0.1 0.2 0.3', 'ok',
		'Bilinear Leveling Grid:', '0 1', '0 0.2 0.3', '1 NaN 0.4', 'ok',
		'[13:14:15.123] Send: N37 G81*99', 'Recv: 0.03 0.04', 'Recv: 0.05 0.06', 'Recv: ok',
		'Recv: 4 7', 'Recv: 8 9',
	].join('\n');
	const { reports, skipped } = findMeshReports(log);
	assert.equal(skipped, 2);
	assert.deepEqual(reports.map(report => report.values), [[[0.03, 0.04], [0.05, 0.06]]]);
	assert.equal(parseMesh(reports[0].raw).format, 'Prusa');
	assert.deepEqual(findMeshReports('Random status message\n1 2\n3 4').reports, []);
	assert.deepEqual(findMeshReports('1,2\n3,4').reports[0].values, [[1, 2], [3, 4]]);
});

test('plain numeric grids preserve zeroes, integer rows, and scientific notation', () => {
	assert.deepEqual(parseMesh('0 1 2\n3 4 5\n6 7 8'), {
		values: [[0, 1, 2], [3, 4, 5], [6, 7, 8]], format: 'Plain grid', rows: 3, columns: 3,
	});
	assert.deepEqual(parseMesh('0 0.1 0.2\n0.3 0.4 0.5').values, [[0, 0.1, 0.2], [0.3, 0.4, 0.5]]);
	assert.deepEqual(parseMesh('-.25 +.5 1e-3\n2. -2E-2 +0').values, [[-0.25, 0.5, 0.001], [2, -0.02, 0]]);
	assert.deepEqual(parseMesh('0 0.1 0.2\n1 0.3 0.4').values, [[0, 0.1, 0.2], [1, 0.3, 0.4]]);
});

test('LF, CRLF and CR line endings produce the same complete matrix', () => {
	for (const newline of ['\n', '\r\n', '\r']) {
		assert.deepEqual(parseMesh(`\uFEFF  0 .1${newline}  ${newline}.2 .3${newline}`).values, [[0, 0.1], [0.2, 0.3]]);
	}
});

test('Marlin column headers and ascending row labels are removed together', () => {
	const mesh = parseMesh('Bilinear Leveling Grid:\n  0 1 2\n0 +0.1 -0.2 +0.3\n1 +0.4 -0.5 +0.6');
	assert.deepEqual(mesh, { values: [[0.1, -0.2, 0.3], [0.4, -0.5, 0.6]], format: 'Marlin', rows: 2, columns: 3 });
});

test('Marlin descending labels and optional repeated footer retain input orientation', () => {
	const mesh = parseMesh('0 1 2\n2 -.1 -.2 -.3\n1 .1 .2 .3\n0 0 .01 .02\n0 1 2');
	assert.equal(mesh.format, 'Marlin');
	assert.deepEqual(mesh.values, [[-0.1, -0.2, -0.3], [0.1, 0.2, 0.3], [0, 0.01, 0.02]]);
	assert.deepEqual(parseMesh('2 1 0\n1 .1 .2 .3\n0 .4 .5 .6').values, [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);
});

test('explicit pipe row labels work with console prefixes and timestamp variants', () => {
	const input = [
		'[2026-11-06 12:34:56.789] Recv: echo: 0 1',
		'< 10:23:45 AM: Recv: 1 | -0.1 +0.2',
		'12:34:56.789 -> Recv: 0 | +0.3 -0.4',
		'Recv: ok',
	].join('\r\n');
	assert.deepEqual(parseMesh(input), { values: [[-0.1, 0.2], [0.3, -0.4]], format: 'Marlin', rows: 2, columns: 2 });
	assert.deepEqual(parseMesh('1 | 0 .1\n0 | .2 .3').values, [[0, 0.1], [0.2, 0.3]]);
});

test('the historical sample retains all 169 measurements despite its extra header index', () => {
	const mesh = parseMesh(readFileSync(new URL('../sample-data.txt', import.meta.url), 'utf8'));
	assert.equal(mesh.rows, 13);
	assert.equal(mesh.columns, 13);
	assert.equal(mesh.format, 'Marlin');
	assert.equal(mesh.values[0][0], 0.035);
	assert.equal(mesh.values[0][12], -0.5725);
	assert.equal(mesh.values[12][12], -0.3675);
	const stats = calculateStats(mesh.values);
	assert.equal(stats.min, -0.5725);
	assert.equal(stats.max, 0.06615);
	near(stats.range, 0.63865);
});

test('the historical header exception also remains safe with console metadata and explicit row markers', () => {
	const sample = readFileSync(new URL('../sample-data.txt', import.meta.url), 'utf8');
	const expected = parseMesh(sample).values;
	const withMetadata = `Recv: Bilinear Leveling Grid:\n${sample.split(/\r\n?|\n/).map(line => `Recv: ${line}`).join('\n')}`;
	assert.deepEqual(parseMesh(withMetadata).values, expected);
	const piped = sample.split(/\r\n?|\n/).map((line, index) => index === 0 ? line : line.replace(/^(\d+)\s+/, '$1 | ')).join('\n');
	assert.deepEqual(parseMesh(piped).values, expected);
	const mismatchedShape = sample.replace('+0.03500', '0.03500');
	assert.throws(() => parseMesh(`Bilinear Leveling Grid:\n${mismatchedShape}`), /header does not match/);
});

test('Prusa G81 metadata is recognized and declared dimensions are checked', () => {
	const mesh = parseMesh('Send: G81\nRecv: Num X,Y: 3,2\nRecv: Z search height: 5\nRecv: Measured points:\nRecv: 0 .1 .2\nRecv: .3 .4 .5\nRecv: ok');
	assert.deepEqual(mesh, { values: [[0, 0.1, 0.2], [0.3, 0.4, 0.5]], format: 'Prusa', rows: 2, columns: 3 });
	assert.throws(() => parseMesh('Num X,Y: 3,3\n0 .1 .2\n.3 .4 .5'), /declares 3 columns × 3 rows.*contains 3 columns × 2 rows/);
});

test('Klipper mesh reports can include known metadata and // console prefixes', () => {
	const mesh = parseMesh('// Mesh X,Y: 2,2\n// Search Height: 5\n// Mesh Offsets: X=0.0000, Y=0.0000\n// Mesh Average: 0.15\n// Mesh Range: min=0 max=0.3\n// Interpolation Algorithm: lagrange\n// Measured points:\n// 0 .1\n// .2 .3');
	assert.equal(mesh.format, 'Klipper');
	assert.deepEqual(mesh.values, [[0, 0.1], [0.2, 0.3]]);
});

// Captured numeric excerpts and their exact provenance are documented in
// docs/FIRMWARE_FIXTURES.md. These exercise public reports, not live hardware.
test('reported Marlin 3x3 output works without an invented title or missing positive values', () => {
	const mesh = parseMesh(fixture('marlin-21185-bilinear-3x3'));
	assert.deepEqual(mesh, {
		values: [[0.117, 0.077, 0.142], [0.007, 0.012, 0.058], [0.112, 0.112, 0.135]],
		format: 'Marlin', rows: 3, columns: 3,
	});
	const stats = calculateStats(mesh.values);
	near(stats.mean, 0.772 / 9);
	near(stats.range, 0.135);
});

test('reported Marlin 1.1.8 bilinear output retains all sixteen negative measurements', () => {
	const mesh = parseMesh(fixture('marlin-9529-bilinear-4x4'));
	assert.deepEqual(mesh, {
		values: [[-0.071, -0.137, -0.228, -0.378], [-0.508, -0.881, -0.647, -0.418],
			[-0.662, -0.943, -0.565, -0.308], [-0.230, -0.204, -0.082, -0.096]],
		format: 'Marlin', rows: 4, columns: 4,
	});
	const stats = calculateStats(mesh.values);
	assert.equal(stats.min, -0.943);
	assert.equal(stats.max, -0.071);
	near(stats.mean, -0.397375);
	near(stats.range, 0.872);
});

test('actual legacy Prusa G81 numeric excerpts retain 49 cells and their reported row order', () => {
	for (const [version, scaledSum, lastRow, min, max] of [
		['3.1.3', 696387, [0.15250, 0.13935, 0.12963, 0.12333, 0.12046, 0.12102, 0.12500], 0.05083, 0.21667],
		['3.5.0', 653332, [0.14250, 0.11000, 0.08750, 0.07500, 0.07250, 0.08000, 0.09750], 0.05250, 0.21167],
	]) {
		const mesh = parseMesh(fixture(`prusa-1281-g81-${version}`));
		// The source excerpt has no preamble: firmware identity cannot be inferred
		// from a plain grid, even though its provenance establishes it as G81.
		assert.equal(mesh.format, 'Plain grid');
		assert.equal(mesh.rows, 7);
		assert.equal(mesh.columns, 7);
		assert.deepEqual(mesh.values[6], lastRow);
		assert.equal(mesh.values.flat().reduce((sum, value) => sum + Math.round(value * 100000), 0), scaledSum);
		const stats = calculateStats(mesh.values);
		assert.equal(stats.min, min);
		assert.equal(stats.max, max);
		near(stats.mean, scaledSum / 100000 / 49);
		assert.deepEqual(parseMesh(exportMeshCsv(mesh.values)).values, mesh.values);
	}
});

test('a source-based Prusa preamble and host timestamp wrapper preserve the real matrix', () => {
	const captured = fixture('prusa-1281-g81-3.5.0');
	// Adaptation, not an additional capture: the official print() implementation
	// establishes these headers. The chosen search height and host prefixes are
	// synthetic, and must not be attributed to the original report.
	const wrapped = ['Send: G81', 'Num X,Y: 7,7', 'Z search height: 5', 'Measured points:',
		...captured.trim().split('\n'), 'ok'].map(line => `[12:34:56.789] Recv: ${line}`).join('\r\n');
	const mesh = parseMesh(wrapped);
	assert.equal(mesh.format, 'Prusa');
	assert.deepEqual(mesh.values, parseMesh(captured).values);
	assert.throws(() => parseMesh(`Num X,Y: 7,7\nMeasured points:\n${captured.trim().split('\n').slice(0, -1).join('\n')}`), /declares 7 columns × 7 rows.*7 columns × 6 rows/);
});

test('actual Klipper probed Z output keeps zeroes and its source orientation', () => {
	const mesh = parseMesh(fixture('klipper-2594-probed-3x3'));
	assert.deepEqual(mesh, {
		values: [[-0.3, -0.65, -0.9], [0.1, 0, -0.45], [0.6, 0.3, 0]],
		format: 'Klipper', rows: 3, columns: 3,
	});
	near(calculateStats(mesh.values).mean, -1.3 / 9);
	assert.equal(calculateStats(mesh.values).range, 1.5);
});

test('actual Klipper interpolated output keeps all 49 heights without treating metadata as measurements', () => {
	const mesh = parseMesh(fixture('klipper-2594-interpolated-7x7'));
	assert.equal(mesh.format, 'Klipper');
	assert.equal(mesh.rows, 7);
	assert.equal(mesh.columns, 7);
	assert.deepEqual(mesh.values[0], [0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0]);
	assert.deepEqual(mesh.values[6], [-0.3, -0.427778, -0.544444, -0.65, -0.744444, -0.827778, -0.9]);
	assert.equal(mesh.values[3][3], 0);
	near(calculateStats(mesh.values).mean, -5.686417 / 49);
	assert.equal(calculateStats(mesh.values).range, 1.5);
	assert.deepEqual(parseMesh(exportMeshCsv(mesh.values)).values, mesh.values);
	// These source blocks print opposite Y orders. Preserve both as pasted;
	// orientation is an explicit user decision, never an inferred parser change.
	const probed = parseMesh(fixture('klipper-2594-probed-3x3')).values;
	for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) assert.equal(mesh.values[y * 3][x * 3], probed[2 - y][x]);
});

test('multiple named grids are rejected even when widths happen to agree', () => {
	const probed = fixture('klipper-2594-probed-3x3');
	const interpolated = fixture('klipper-2594-interpolated-7x7');
	const marlin = fixture('marlin-9529-bilinear-4x4');
	for (const input of [
		probed + interpolated, interpolated + probed, probed + probed, interpolated + interpolated, marlin + marlin,
		'Mesh Leveling Probed Z positions:\n0 .1\n.2 .3\nMesh X,Y: 2,2\nMeasured points:\n0 .1\n.2 .3',
		'Measured points:\n0 .1\n.2 .3\nMeasured points:\n.4 .5\n.6 .7',
		'0 .1\n.2 .3\nSend: G81\n.4 .5\n.6 .7',
	]) assert.throws(() => parseMesh(input), /More than one mesh report.*one grid per panel/);
});

test('Klipper generated X/Y probe locations are explicitly rejected as height data', () => {
	assert.throws(() => parseMesh(fixture('klipper-docs-generated-coordinates')), /X\/Y locations, not a mesh of Z heights/);
});

test('CSV and JSON retain exact numeric cell structure', () => {
	assert.deepEqual(parseMesh('0, +0.1, -0.2\n.3, .4, .5'), { values: [[0, 0.1, -0.2], [0.3, 0.4, 0.5]], format: 'CSV', rows: 2, columns: 3 });
	assert.deepEqual(parseMesh('[[0, 1], [2, 3]]'), { values: [[0, 1], [2, 3]], format: 'JSON', rows: 2, columns: 2 });
	assert.deepEqual(parseMesh('0 [.1] .2\n.3 .4 .5').values, [[0, 0.1, 0.2], [0.3, 0.4, 0.5]]);
	assert.deepEqual(parseMesh('0,[.1],.2\n.3,.4,.5').values, [[0, 0.1, 0.2], [0.3, 0.4, 0.5]]);
});

test('bracketed probe markers cannot join adjacent numbers or hide a missing separator', () => {
	for (const input of ['0.1[2] 0.3\n0.4 0.5', '0[1] 2\n3 4', '[.1].2 0.3\n0.4 0.5', '[.1][.2] 0.3\n0.4 0.5']) {
		assert.throws(() => parseMesh(input), /Line 1:.*must be separated/);
	}
	assert.throws(() => parseMesh('Bilinear Leveling Grid:\n0 1\n0 | .1[2] .3\n1 | .4 .5'), /Line 3:.*must be separated/);
	assert.deepEqual(parseMesh('Bilinear Leveling Grid:\n0 1\n0 | [.1] .2\n1 | .3 [.4]').values, [[0.1, 0.2], [0.3, 0.4]]);
});

test('malformed values, missing CSV cells, and ragged rows are rejected', () => {
	for (const input of ['0 .1 nope\n.2 .3 .4', '0 NaN\n.1 .2', '0 Infinity\n.1 .2', '0 1e999\n.1 .2', '0 *\n.1 .2', '0, 1 2\n3, 4']) {
		assert.throws(() => parseMesh(input), /Line 1:.*finite number/);
	}
	for (const input of ['0,,.1\n.2,.3,.4', '0,.1,\n.2,.3,.4', ',0\n.1,.2']) assert.throws(() => parseMesh(input), /missing/);
	assert.throws(() => parseMesh('0 .1 .2\n.3 .4'), /Row 2.*2 values.*expected 3/);
	assert.throws(() => parseMesh('[[0, 1], [2]]'), /same length/);
	assert.throws(() => parseMesh('[[0, null], [1, 2]]'), /finite number/);
	assert.throws(() => parseMesh('[["0", 1], [2, 3]]'), /finite number/);
	assert.throws(() => parseMesh('[[0, 1], [2, 3],]'), /JSON mesh is not valid/);
});

test('unknown lines and corrupt numbered grids are not guessed into a mesh', () => {
	assert.throws(() => parseMesh('Something unexpected\n0 .1\n.2 .3'), /Line 1:.*finite number/);
	assert.throws(() => parseMesh('0 1\n0 | .1 .2\n0 | .3 .4'), /missing or duplicate rows/);
	assert.throws(() => parseMesh('0 1\n0 .1 .2\n2 .3 .4'), /row labels/);
	assert.throws(() => parseMesh('0 1 2 3\n0 | .1 .2\n1 | .3 .4'), /header does not match/);
	assert.throws(() => parseMesh('0 |\n1 | .2 .3'), /row has no values/);
	assert.throws(() => parseMesh('Num X,Y: 1,1\n0\nNum X,Y: 1,1\n1'), /More than one mesh report/);
});

test('numbered header mismatches cannot hide a whole missing column outside the historical sample', () => {
	for (const input of [
		'0 1 2\n0 | .1 .2\n1 | .3 .4',
		'0 1 2\n1 | +.1 -.2\n0 | +.3 -.4',
		'Bilinear Leveling Grid:\n0 1 2\n0 .1 .2\n1 .3 .4',
		'Bilinear Leveling Grid:\n0 1 2\n1 +.1 -.2\n0 +.3 -.4',
	]) assert.throws(() => parseMesh(input), /header does not match.*2 mesh columns/);
	assert.deepEqual(parseMesh('Bilinear Leveling Grid:\n0 1\n0 | .1 .2\n1 | .3 .4').values, [[0.1, 0.2], [0.3, 0.4]]);
	assert.deepEqual(parseMesh('Bilinear Leveling Grid:\n0 1\n1 .1 .2\n0 .3 .4').values, [[0.1, 0.2], [0.3, 0.4]]);
	// Without labels or metadata, a rectangular integer-leading grid is data.
	assert.deepEqual(parseMesh('0 1 2\n0 .1 .2\n1 .3 .4').values, [[0, 1, 2], [0, 0.1, 0.2], [1, 0.3, 0.4]]);
});

test('empty inputs and oversized meshes report useful errors', () => {
	for (const input of ['', ' \r\n\t', 'Recv: ok', 'Measured points:']) assert.throws(() => parseMesh(input), /Paste a mesh|No numeric mesh rows/);
	assert.throws(() => parseMesh(null), /as text/);
	assert.throws(() => parseMesh('1'.repeat(1_000_001)), /too large/);
	assert.throws(() => parseMesh(Array(101).fill('.1 .2').join('\n')), /at most 100/);
	assert.throws(() => parseMesh(Array(101).fill('.1').join(' ')), /at most 100/);
	const maximum = parseMesh(Array(100).fill(Array(100).fill('0').join(' ')).join('\n'));
	assert.equal(maximum.rows, 100);
	assert.equal(maximum.columns, 100);
});

test('statistics give signed mean, population standard deviation, and peak-to-valley range', () => {
	assert.deepEqual(calculateStats([[-0.2, 0.2]]), { mean: 0, std: 0.2, min: -0.2, max: 0.2, range: 0.4 });
	assert.deepEqual(calculateStats([[0.5, 0.5], [0.5, 0.5]]), { mean: 0.5, std: 0, min: 0.5, max: 0.5, range: 0 });
	const stats = calculateStats([[-0.4, -0.2], [0.1, 0.3]]);
	near(stats.mean, -0.05);
	near(stats.std, Math.sqrt(0.0725));
	near(stats.range, 0.7);
	assert.deepEqual(calculateStats([[0]]), { mean: 0, std: 0, min: 0, max: 0, range: 0 });
	assert.equal(calculateStats([[1e308, 1e308]]).mean, 1e308);
	assert.throws(() => calculateStats([[-1e308, 1e308]]), /too large.*statistics/);
});

test('all public numeric APIs reject sparse, missing, ragged, or nonfinite matrices', () => {
	for (const api of [calculateStats, analyzeMesh, removeFittedTilt, exportMeshCsv, transformMesh]) {
		for (const input of [[], [[]], [[1], [2, 3]], [[NaN]], [[Infinity]], [[undefined]], [[, 1]], [[1], , [2]]]) {
			assert.throws(() => api(input), /row|Row|finite|same length/i);
		}
	}
});

test('a perfect tilted plane reports signed end-to-end rises and zero residual shape', () => {
	const values = Array.from({ length: 3 }, (_, y) => Array.from({ length: 4 }, (_, x) => 0.5 + 0.2 * x - 0.3 * y));
	const analysis = analyzeMesh(values);
	assert.equal(analysis.canFitPlane, true);
	near(analysis.plane.xRise, 0.6);
	near(analysis.plane.yRise, -0.6);
	near(analysis.plane.xSlope, 0.2);
	near(analysis.plane.ySlope, -0.3);
	near(analysis.plane.intercept, 0.5);
	near(analysis.residualRange, 0);
	near(analysis.residualRms, 0);
	for (const row of removeFittedTilt(values)) for (const value of row) near(value, 0);
	const falling = analyzeMesh([[1, 0.75, 0.5], [0.5, 0.25, 0], [0, -0.25, -0.5]]);
	near(falling.plane.xRise, -0.5);
	near(falling.plane.yRise, -1);
	near(falling.plane.intercept, 1);
});

test('a bowl retains curvature after plane removal, with useful residual and robust statistics', () => {
	const values = [[2, 1, 2], [1, 0, 1], [2, 1, 2]];
	const analysis = analyzeMesh(values);
	assert.equal(analysis.median, 1);
	near(analysis.meanAbsDeviation, 16 / 27);
	near(analysis.plane.xRise, 0);
	near(analysis.plane.yRise, 0);
	near(analysis.plane.intercept, 4 / 3);
	near(analysis.residualRange, 2);
	near(analysis.residualRms, 2 / 3);
	const residuals = removeFittedTilt(values);
	near(residuals[1][1], -4 / 3);
	near(residuals[0][0], 2 / 3);
});

test('a saddle remains visible instead of being mistaken for a planar tilt', () => {
	const values = [[1, 0, -1], [0, 0, 0], [-1, 0, 1]];
	const analysis = analyzeMesh(values);
	near(analysis.plane.xSlope, 0);
	near(analysis.plane.ySlope, 0);
	near(analysis.plane.intercept, 0);
	near(analysis.residualRange, 2);
	near(analysis.residualRms, 2 / 3);
	assert.equal(analysis.median, 0);
	near(analysis.meanAbsDeviation, 4 / 9);
	assert.deepEqual(removeFittedTilt(values), values);
});

test('median sorts numerically and mean absolute deviation is measured about the arithmetic mean', () => {
	const values = [[10, 2], [4, 1]];
	const analysis = analyzeMesh(values);
	assert.equal(analysis.median, 3);
	near(analysis.meanAbsDeviation, 2.875);
	assert.deepEqual(values, [[10, 2], [4, 1]]);
	assert.equal(analyzeMesh([[Number.MIN_VALUE, Number.MIN_VALUE]]).median, Number.MIN_VALUE);
});

test('residual shape is invariant to an added plane, and outputs never mutate source rows', () => {
	const values = [[2, 1, 2], [1, 0, 1], [2, 1, 2]];
	const original = values.map(row => [...row]);
	const tilted = values.map((row, y) => row.map((value, x) => value + 10 - 0.25 * x + 0.5 * y));
	const baseline = analyzeMesh(values);
	const analysis = analyzeMesh(tilted);
	near(analysis.plane.xRise, -0.5);
	near(analysis.plane.yRise, 1);
	near(analysis.plane.intercept, baseline.plane.intercept + 10);
	near(analysis.residualRange, baseline.residualRange);
	near(analysis.residualRms, baseline.residualRms);
	const residuals = removeFittedTilt(tilted);
	const expected = removeFittedTilt(values);
	for (let y = 0; y < values.length; y++) for (let x = 0; x < values[y].length; x++) near(residuals[y][x], expected[y][x]);
	assert.notEqual(residuals, tilted);
	assert.notEqual(residuals[0], tilted[0]);
	residuals[0][0] = 999;
	assert.deepEqual(values, original);
	assert.equal(tilted[0][0], 12);
});

test('plane fitting preserves small tilts on large offsets and rejects numerical overflow', () => {
	const offset = 1e16;
	const analysis = analyzeMesh([[offset, offset + 2], [offset, offset + 2]]);
	near(analysis.plane.xRise, 2);
	near(analysis.plane.yRise, 0);
	assert.equal(analysis.plane.intercept, offset);
	assert.equal(analysis.meanAbsDeviation, 1);
	near(analysis.residualRange, 0);
	near(analysis.residualRms, 0);
	const flat = analyzeMesh([[1e308, 1e308], [1e308, 1e308]]);
	assert.equal(flat.median, 1e308);
	assert.equal(flat.plane.intercept, 1e308);
	assert.equal(flat.residualRms, 0);
	assert.throws(() => analyzeMesh([[1.6e308, 1.6e308], [1.6e308, 0]]), /too large.*finite plane/);
	assert.throws(() => removeFittedTilt([[1.6e308, 1.6e308], [1.6e308, 0]]), /too large.*finite plane/);
});

test('one-dimensional meshes retain median/MAD while explicitly declining a plane fit', () => {
	for (const values of [[[0, 2, 4]], [[0], [2], [4]]]) {
		assert.deepEqual(analyzeMesh(values), { median: 2, meanAbsDeviation: 4 / 3, plane: null, residualRange: null, residualRms: null, canFitPlane: false });
		assert.throws(() => removeFittedTilt(values), /at least two rows and two columns/);
	}
	assert.deepEqual(analyzeMesh([[5]]), { median: 5, meanAbsDeviation: 0, plane: null, residualRange: null, residualRms: null, canFitPlane: false });
});

test('CSV export round-trips values without headers or lossy rounding', () => {
	const values = [[0, 0.1234567890123], [-0.2, 3e-8]];
	const csv = exportMeshCsv(values);
	assert.equal(csv, '0,0.1234567890123\n-0.2,3e-8');
	assert.deepEqual(parseMesh(csv).values, values);
});

test('orientation and centering transformations return independent copies', () => {
	const values = [[0, 1, 2], [3, 4, 5]];
	assert.deepEqual(transformMesh(values, { flipX: true }), [[2, 1, 0], [5, 4, 3]]);
	assert.deepEqual(transformMesh(values, { flipY: true }), [[3, 4, 5], [0, 1, 2]]);
	const centered = transformMesh(values, { flipX: true, flipY: true, center: true });
	assert.deepEqual(centered, [[2.5, 1.5, 0.5], [-0.5, -1.5, -2.5]]);
	near(calculateStats(centered).mean, 0);
	assert.deepEqual(values, [[0, 1, 2], [3, 4, 5]]);
	const copied = transformMesh(values);
	assert.notEqual(copied, values);
	assert.notEqual(copied[0], values[0]);
	assert.throws(() => transformMesh(values, { center: 'yes' }), /true or false/);
});
