import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlotly, renderMeshPlot, purgePlot, resetPlotView, downloadPlot, heatmapCell } from '../js/mesh-plot.mjs';

function browserGlobals(t, window, document = { scripts: [] }) {
	const originals = new Map(['window', 'document'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
	Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: window });
	Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: document });
	t.after(() => {
		for (const [name, descriptor] of originals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
	});
}

function plottingBrowser(t) {
	const calls = { renders: [], updates: [], images: [], purges: [] };
	const Plotly = {
		async react(element, data, layout, config) {
			calls.renders.push({ element, data, layout, config });
			element._fullLayout = layout;
			return element;
		},
		async relayout(element, update) { calls.updates.push({ element, update }); return element; },
		async downloadImage(element, options) { calls.images.push({ element, options }); return 'image.png'; },
		purge(element) { calls.purges.push(element); delete element._fullLayout; },
	};
	browserGlobals(t, { Plotly });
	return { calls, Plotly };
}

function container() {
	return {
		getBoundingClientRect: () => ({ width: 640, height: 480 }),
		get innerHTML() { return '<span>Plotly-owned content</span>'; },
		set innerHTML(value) { assert.fail(`The wrapper must not overwrite chart markup with ${JSON.stringify(value)}.`); },
	};
}

test('a difference cell marks the same physical position on flipped panels and surfaces', async t => {
	const { calls } = plottingBrowser(t);
	const area = { width: 180, depth: 120 };
	const point = heatmapCell({ curveNumber: 0, x: 90, y: 120 }, { columns: 3, rows: 2, dimensions: area });
	assert.deepEqual(point, { x: 1, y: 1 });
	assert.equal(heatmapCell({ curveNumber: 0, x: 91, y: 120 }, { columns: 3, rows: 2, dimensions: area }), null);
	const values = [[0, 1, 2], [3, 4, 5]];
	await renderMeshPlot(container(), values, { ...area, point, flipY: true });
	const marker = calls.renders[0].data[1];
	assert.deepEqual([marker.type, marker.x, marker.y, marker.z], ['scatter3d', [90], [120], [1]]);
	await renderMeshPlot(container(), values, { ...area, point, view: 'heatmap' });
	assert.deepEqual(calls.renders[1].data[1].x, [90]);
	assert.deepEqual(calls.renders[1].data[1].y, [120]);
	await renderMeshPlot(container(), values, { ...area, point: null, view: 'heatmap' });
	assert.equal(calls.renders[2].data.length, 1);
});

test('the plotting module imports without browser globals and reports browser-only loading', async t => {
	browserGlobals(t, undefined, undefined);
	await assert.rejects(loadPlotly(), /available in a browser/);
	assert.doesNotThrow(() => purgePlot(container()));
});

test('explicit bounds label and select physical heatmap points after flips', async t => {
	const { calls } = plottingBrowser(t);
	const dimensions = { width: 180, depth: 120, bounds: { minX: -30, maxX: 150, minY: 20, maxY: 140 } };
	const point = heatmapCell({ curveNumber: 0, x: 60, y: 20 }, { columns: 3, rows: 2, dimensions });
	assert.deepEqual(point, { x: 1, y: 0 });
	await renderMeshPlot(container(), [[0, 1, 2], [3, 4, 5]], { ...dimensions, point, flipY: true, view: 'heatmap', frontEdge: 'minY' });
	const { data, layout } = calls.renders[0];
	assert.deepEqual(data[0].x, [-30, 60, 150]);
	assert.deepEqual(data[0].y, [20, 140]);
	assert.deepEqual(data[0].z[0], [3, 4, 5]);
	assert.equal(layout.annotations[0].y, 20);
	assert.equal(layout.annotations[0].text, 'FRONT');
});

test('shared bounds apply to centered heights, colors, and Z while updating the same element', async t => {
	const { calls } = plottingBrowser(t);
	const element = container();
	const values = [[0, 0.1], [0.2, 0.3]];
	const options = { reference: 'mean', range: [-0.5, 0.5], uirevision: 'comparison' };
	assert.equal(await renderMeshPlot(element, values, options), element);
	assert.ok(Math.abs(calls.renders[0].data[0].z[0][0] + 0.15) < 1e-12);
	assert.ok(Math.abs(calls.renders[0].data[0].z[1][1] - 0.15) < 1e-12);
	assert.deepEqual(calls.renders[0].layout.scene.zaxis.range, [-0.5, 0.5]);
	assert.equal(calls.renders[0].layout.coloraxis.cmin, -0.5);
	assert.equal(calls.renders[0].layout.coloraxis.cmax, 0.5);
	await renderMeshPlot(element, [[0.5, 0.5], [0.5, 0.5]], { reference: 'mean', range: [-0.5, 0.5], uirevision: 'comparison' });
	assert.equal(calls.renders.length, 2);
	assert.ok(calls.renders.every(call => call.element === element));
	assert.deepEqual(calls.renders[1].data[0].z, [[0, 0], [0, 0]]);
	assert.equal(element.innerHTML, '<span>Plotly-owned content</span>');
	assert.deepEqual(values, [[0, 0.1], [0.2, 0.3]]);
});

test('physical coordinates need both dimensions, and flat meshes retain a useful auto scale', async t => {
	const { calls } = plottingBrowser(t);
	const element = container();
	const values = [[0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]];
	await renderMeshPlot(element, values, { width: 200, depth: 180 });
	assert.deepEqual(calls.renders[0].data[0].x, [0, 100, 200]);
	assert.deepEqual(calls.renders[0].data[0].y, [0, 90, 180]);
	assert.match(calls.renders[0].layout.scene.xaxis.title.text, /mm/);
	const { cmin, cmax } = calls.renders[0].layout.coloraxis;
	assert.ok(cmax - cmin >= 0.02);
	assert.ok(Math.abs((cmin + cmax) / 2 - 0.5) < 1e-12);
	await renderMeshPlot(element, values, { width: 200 });
	assert.deepEqual(calls.renders[1].data[0].x, [0, 1, 2]);
	assert.deepEqual(calls.renders[1].data[0].y, [0, 1, 2]);
	assert.match(calls.renders[1].layout.scene.xaxis.title.text, /sample point/);
});

test('surface proportions preserve wide, tall, and sample-index geometry without changing the camera', async t => {
	const { calls } = plottingBrowser(t);
	const element = container();
	const values = [[0, 0.1], [0.2, 0.3]];
	await renderMeshPlot(element, values, { width: 400, depth: 100 });
	await renderMeshPlot(element, values, { width: 100, depth: 400 });
	assert.deepEqual(calls.renders[0].layout.scene.aspectratio, { x: 1, y: 0.25, z: 0.45 });
	assert.deepEqual(calls.renders[1].layout.scene.aspectratio, { x: 0.25, y: 1, z: 0.45 });
	await renderMeshPlot(element, [[0, 0.1, 0.2], [0.3, 0.4, 0.5]]);
	assert.deepEqual(calls.renders[2].layout.scene.aspectratio, { x: 1, y: 0.5, z: 0.45 });
	await renderMeshPlot(element, [[0, 0.1], [0.2, 0.3], [0.4, 0.5]], { width: 400 });
	assert.deepEqual(calls.renders[3].layout.scene.aspectratio, { x: 0.5, y: 1, z: 0.45 });
	for (const call of calls.renders) {
		assert.deepEqual(call.layout.scene.camera.eye, { x: 1.35, y: -1.6, z: 1.15 });
	}
});

test('heatmap Y ascends with row order and changes orientation only when requested', async t => {
	const { calls } = plottingBrowser(t);
	const element = container();
	const values = [[0, 1], [2, 3]];
	await renderMeshPlot(element, values, { view: 'heatmap' });
	assert.deepEqual(calls.renders[0].data[0].y, [0, 1]);
	assert.deepEqual(calls.renders[0].data[0].z, values);
	assert.equal(calls.renders[0].layout.yaxis.autorange, true);
	await renderMeshPlot(element, values, { view: 'heatmap', flipX: true, flipY: true });
	assert.deepEqual(calls.renders[1].data[0].y, [0, 1]);
	assert.deepEqual(calls.renders[1].data[0].z, [[3, 2], [1, 0]]);
	await renderMeshPlot(element, [[0.1]], { view: 'heatmap' });
	assert.deepEqual(calls.renders[2].data[0].z, [[0.1]]);
	assert.deepEqual(values, [[0, 1], [2, 3]]);
});

test('fitted-plane reference removes tilt before flips and preserves physical geometry and shared bounds', async t => {
	const { calls } = plottingBrowser(t);
	const element = container();
	// Best-fit plane is z = x + 3*y + 2; the remaining saddle is ±1 mm.
	const values = [[3, 2], [4, 7]];
	await renderMeshPlot(element, values, { reference: 'plane', flipX: true, width: 400, depth: 100, range: [-2, 2] });
	const surface = calls.renders[0];
	const expected = [[-1, 1], [1, -1]];
	for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) assert.ok(Math.abs(surface.data[0].z[y][x] - expected[y][x]) < 1e-12);
	assert.deepEqual(surface.layout.scene.aspectratio, { x: 1, y: 0.25, z: 0.45 });
	assert.deepEqual(surface.layout.scene.zaxis.range, [-2, 2]);
	assert.equal(surface.layout.coloraxis.cmin, -2);
	assert.equal(surface.layout.coloraxis.cmax, 2);
	assert.equal(surface.layout.scene.zaxis.title.text, 'Height from fitted plane (mm)');
	assert.equal(surface.layout.coloraxis.colorbar.title.text, 'ΔZ (mm)');
	assert.match(surface.data[0].hovertemplate, /Height from fitted plane:.*mm/);
	await renderMeshPlot(element, values, { reference: 'plane', view: 'heatmap', flipY: true });
	const heatmap = calls.renders[1];
	for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) assert.ok(Math.abs(heatmap.data[0].z[y][x] - expected[y][x]) < 1e-12);
	assert.equal(heatmap.layout.yaxis.autorange, true);
	assert.match(heatmap.data[0].hovertemplate, /Height from fitted plane/);
	await assert.rejects(renderMeshPlot(element, [[0, 1]], { view: 'heatmap', reference: 'plane' }), /at least two rows and two columns/);
	assert.deepEqual(values, [[3, 2], [4, 7]]);
});

test('difference heatmaps show signed after-minus-before values around a neutral zero', async t => {
	const { calls } = plottingBrowser(t);
	const element = container();
	const values = [[-0.1, 0], [0.05, 0.2]];
	await renderMeshPlot(element, values, { view: 'heatmap', difference: true, range: [-0.2, 0.2] });
	const chart = calls.renders[0];
	assert.deepEqual(chart.data[0].z, values);
	assert.equal(chart.layout.coloraxis.cmin, -0.2);
	assert.equal(chart.layout.coloraxis.cmax, 0.2);
	assert.deepEqual(chart.layout.coloraxis.colorscale, [[0, '#2166b1'], [0.5, '#f7f8fb'], [1, '#dc6874']]);
	assert.match(chart.data[0].hovertemplate, /after − before.*%\{z:\+\.4f\} mm/);
	assert.equal(chart.layout.coloraxis.colorbar.title.text, 'ΔZ (mm)');
	await renderMeshPlot(element, values, { view: 'heatmap', difference: true });
	assert.equal(calls.renders[1].layout.coloraxis.cmin, -calls.renders[1].layout.coloraxis.cmax);
	await assert.rejects(renderMeshPlot(element, values, { view: 'heatmap', difference: true, range: [-0.1, 0.2] }), /symmetric/);
	await assert.rejects(renderMeshPlot(element, values, { difference: true }), /use a heatmap/);
	assert.deepEqual(values, [[-0.1, 0], [0.05, 0.2]]);
});

test('lazy loading shares a request, reports failure, removes the failed script, and retries', async t => {
	const scripts = [];
	let requests = 0;
	class Script extends EventTarget {
		dataset = {};
		remove() { const index = scripts.indexOf(this); if (index >= 0) scripts.splice(index, 1); }
	}
	const window = {};
	const document = {
		scripts,
		createElement(name) { assert.equal(name, 'script'); return new Script(); },
		head: { append(script) { scripts.push(script); requests++; } },
	};
	browserGlobals(t, window, document);
	// A separate module instance isolates the loader cache from the other tests.
	const { loadPlotly: load } = await import('../js/mesh-plot.mjs?loader-test');
	t.after(() => { for (const script of [...scripts]) script.dispatchEvent(new Event('error')); });
	const first = load();
	const second = load();
	assert.equal(first, second);
	assert.equal(requests, 1);
	assert.equal(scripts[0].src, 'https://cdn.plot.ly/plotly-2.18.2.min.js');
	const rejected = assert.rejects(first, /Check your connection and try Visualize again/);
	scripts[0].dispatchEvent(new Event('error'));
	await rejected;
	assert.equal(scripts.length, 0);
	const retry = load();
	assert.equal(requests, 2);
	const Plotly = { react() {} };
	window.Plotly = Plotly;
	scripts[0].dispatchEvent(new Event('load'));
	assert.equal(await retry, Plotly);
	assert.equal(await load(), Plotly);
	assert.equal(requests, 2);
});

test('render failures remain recoverable, and purge safely releases only requested plots', async t => {
	const { calls, Plotly } = plottingBrowser(t);
	const element = container();
	const cause = new Error('WebGL unavailable');
	Plotly.react = async () => { throw cause; };
	await assert.rejects(renderMeshPlot(element, [[0, 1], [2, 3]]), error => error.message.includes('Choose Heatmap') && error.cause === cause);
	await assert.rejects(renderMeshPlot(element, [[0, 1], [2, 3]], { view: 'heatmap' }), /heatmap could not be drawn/);
	await assert.rejects(renderMeshPlot(element, [[0]]), /at least two rows and two columns/);
	await assert.rejects(renderMeshPlot(element, [[0, 1], [2, 3]], { range: [1, 1] }), /minimum below the maximum/);
	assert.doesNotThrow(() => purgePlot());
	purgePlot(element);
	assert.deepEqual(calls.purges, [element]);
	window.Plotly = undefined;
	assert.doesNotThrow(() => purgePlot(element));
});

test('reset and PNG export require a plot and operate on the displayed chart', async t => {
	const { calls } = plottingBrowser(t);
	const element = container();
	await assert.rejects(resetPlotView(element), /Visualize a mesh/);
	await assert.rejects(downloadPlot(element), /Visualize a mesh/);
	await renderMeshPlot(element, [[0, 1], [2, 3]], { view: 'heatmap' });
	await resetPlotView(element, 'heatmap');
	assert.equal(calls.updates[0].element, element);
	assert.deepEqual(calls.updates[0].update, { 'xaxis.autorange': true, 'yaxis.autorange': true });
	assert.equal(await downloadPlot(element, 'mesh:comparison.png'), 'image.png');
	assert.equal(calls.images[0].element, element);
	assert.equal(calls.images[0].options.format, 'png');
	assert.equal(calls.images[0].options.filename, 'mesh-comparison');
});
