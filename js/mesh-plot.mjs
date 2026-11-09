import { calculateStats, transformMesh, removeFittedTilt } from './mesh-data.mjs';
import { axisPosition, frontEdgeText, FRONT_EDGES } from './mesh-coordinates.mjs';

const PLOTLY_URL = 'https://cdn.plot.ly/plotly-2.18.2.min.js';
const FONT = 'Helvetica, Arial, sans-serif';
export const MESH_COLORS = [[0, '#2166b1'], [0.34, '#51c2d5'], [0.67, '#7775d7'], [1, '#f28c82']];
export const DIFFERENCE_COLORS = [[0, '#2166b1'], [0.5, '#f7f8fb'], [1, '#dc6874']];
let plotlyPromise;

function defaultCamera() {
	return {
		eye: { x: 1.35, y: -1.6, z: 1.15 },
		center: { x: 0, y: 0, z: 0 },
		up: { x: 0, y: 0, z: 1 },
		projection: { type: 'perspective' },
	};
}

/** Load the existing pinned Plotly release once, with retry after a failed load. */
export function loadPlotly() {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return Promise.reject(new Error('Charts are available in a browser.'));
	}
	if (typeof window.Plotly?.react === 'function') return Promise.resolve(window.Plotly);
	if (plotlyPromise) return plotlyPromise;
	const pending = new Promise((resolve, reject) => {
		const existing = Array.from(document.scripts).find(script => script.src === PLOTLY_URL);
		const script = existing ?? document.createElement('script');
		let timer;
		const cleanup = () => {
			clearTimeout(timer);
			script.removeEventListener('load', loaded);
			script.removeEventListener('error', failed);
		};
		const failed = () => {
			cleanup();
			script.remove();
			reject(new Error('The chart library could not be loaded. Check your connection and try Visualize again.'));
		};
		const loaded = () => {
			if (typeof window.Plotly?.react !== 'function') return failed();
			cleanup();
			resolve(window.Plotly);
		};
		script.addEventListener('load', loaded, { once: true });
		script.addEventListener('error', failed, { once: true });
		timer = setTimeout(failed, 20_000);
		if (!existing) {
			script.src = PLOTLY_URL;
			script.async = true;
			script.dataset.bedmeshPlotly = 'true';
			document.head.append(script);
		}
	});
	plotlyPromise = pending;
	pending.catch(() => { if (plotlyPromise === pending) plotlyPromise = undefined; });
	return pending;
}

function coordinates(count, size, start, end) {
	return Array.from({ length: count }, (_, index) => axisPosition(index, count, size, start, end));
}

export function heatmapCell(point, { columns, rows, dimensions }) {
	if (point?.curveNumber !== 0) return null;
	const bounds = dimensions.bounds;
	const x = coordinates(columns, dimensions.width, bounds?.minX, bounds?.maxX).indexOf(point.x);
	const y = coordinates(rows, dimensions.depth, bounds?.minY, bounds?.maxY).indexOf(point.y);
	return x >= 0 && y >= 0 ? { x, y } : null;
}

function coordinateAxis(name, positions, physical) {
	const tickCount = Math.min(positions.length, 6);
	const tickvals = Array.from({ length: tickCount }, (_, index) =>
		positions[tickCount === 1 ? 0 : Math.round(index / (tickCount - 1) * (positions.length - 1))]);
	return {
		title: { text: `${name} (${physical ? 'mm' : 'sample point'})`, font: { size: 12 } },
		type: 'linear',
		tickmode: 'array',
		tickvals,
		ticktext: tickvals.map(value => physical ? String(Number(value.toPrecision(5))) : String(value)),
		tickfont: { size: 11 },
		gridcolor: '#dde8f1',
		zerolinecolor: '#c2d5e5',
		linecolor: '#c2d5e5',
		automargin: true,
	};
}

function plotRange(values, requested) {
	if (requested !== null && requested !== undefined) {
		if (!Array.isArray(requested) || requested.length !== 2 ||
			requested.some(value => typeof value !== 'number' || !Number.isFinite(value)) || requested[0] >= requested[1]) {
			throw new Error('The height range must contain two finite numbers, with the minimum below the maximum.');
		}
		return [...requested];
	}
	const { min, max, range } = calculateStats(values);
	const span = Math.max(range, 0.02);
	const midpoint = min / 2 + max / 2;
	const bounds = [midpoint - span * 0.6, midpoint + span * 0.6];
	if (!bounds.every(Number.isFinite) || bounds[0] >= bounds[1]) throw new Error('These mesh heights are too large to display.');
	return bounds;
}

function figure(values, options) {
	const { view = 'surface', flipX = false, flipY = false, reference = 'original',
		width = null, depth = null, bounds: sampled = null, frontEdge = '', range = null,
		uirevision = 'mesh', difference = false, spread = false, point = null } = options;
	if (view !== 'surface' && view !== 'heatmap') throw new Error('Choose the surface or heatmap view.');
	if (!['original', 'mean', 'plane'].includes(reference)) throw new Error('Choose the original heights, mean, or fitted-plane reference.');
	if (typeof difference !== 'boolean') throw new TypeError('The difference view option must be true or false.');
	if (difference && (view !== 'heatmap' || reference !== 'original')) throw new Error('Mesh differences use a heatmap of the already-referenced height changes.');
	if (typeof uirevision !== 'string') throw new TypeError('The plot view revision must be a string.');
	for (const value of [width, depth]) {
		if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
			throw new Error('Sampled width and depth must be positive dimensions in millimetres, or left empty.');
		}
	}
	const source = reference === 'plane' ? removeFittedTilt(values) : values;
	const z = transformMesh(source, { flipX, flipY, center: reference === 'mean' });
	if (view === 'surface' && (z.length < 2 || z[0].length < 2)) {
		throw new Error('A 3D surface needs at least two rows and two columns. Choose Heatmap for this mesh.');
	}
	const physical = width !== null && depth !== null;
	const x = coordinates(z[0].length, physical ? width : null, sampled?.minX, sampled?.maxX);
	const y = coordinates(z.length, physical ? depth : null, sampled?.minY, sampled?.maxY);
	let bounds = plotRange(z, range);
	if (difference && range === null) {
		const limit = Math.max(Math.abs(bounds[0]), Math.abs(bounds[1]));
		bounds = [-limit, limit];
	}
	if (difference && bounds[0] !== -bounds[1]) throw new Error('A difference heatmap needs a symmetric height range around zero.');
	const heightLabel = spread ? 'Run-to-run spread' : difference ? 'Δ height (after − before)' : reference === 'plane' ? 'Height from fitted plane' : reference === 'mean' ? 'Height from mean' : 'Height';
	const trace = {
		type: view,
		x, y, z,
		coloraxis: 'coloraxis',
		name: difference ? 'Mesh difference' : 'Bed mesh',
		showlegend: false,
		hovertemplate: `X: %{x}${physical ? ' mm' : ''}<br>Y: %{y}${physical ? ' mm' : ''}<br>${heightLabel}: %{z:${difference ? '+' : ''}.4f} mm<extra></extra>`,
	};
	const layout = {
		autosize: true,
		uirevision,
		showlegend: false,
		paper_bgcolor: 'rgba(255,255,255,0)',
		plot_bgcolor: '#fff',
		font: { family: FONT, size: 12, color: '#42566b' },
		hoverlabel: { bgcolor: '#fff', bordercolor: '#b8cfdf', font: { family: FONT, size: 12, color: '#203d57' } },
		margin: view === 'surface' ? { l: 4, r: 64, b: 18, t: 18 } : { l: 62, r: 72, b: 55, t: 24 },
		coloraxis: {
			colorscale: (difference ? DIFFERENCE_COLORS : MESH_COLORS).map(stop => [...stop]),
			cauto: false,
			cmin: bounds[0],
			cmax: bounds[1],
			showscale: true,
			colorbar: {
				title: { text: spread ? 'Spread (mm)' : difference || reference !== 'original' ? 'ΔZ (mm)' : 'Z (mm)', font: { size: 11 } },
				thickness: 12,
				len: 0.72,
				x: 1.02,
				xpad: 4,
				outlinewidth: 0,
				tickformat: '.3f',
				tickfont: { size: 10 },
			},
		},
	};
	if (view === 'surface') {
		const xExtent = physical ? width : z[0].length - 1;
		const yExtent = physical ? depth : z.length - 1;
		const largestExtent = Math.max(xExtent, yExtent);
		trace.contours = { z: { show: false, highlight: true, highlightcolor: '#2166b1', project: { z: false } } };
		layout.scene = {
			uirevision,
			camera: defaultCamera(),
			dragmode: 'orbit',
			aspectmode: 'manual',
			// Preserve the sampled area's XY geometry. Z is intentionally
			// exaggerated for inspection; this is not a true-scale slope view.
			aspectratio: { x: xExtent / largestExtent, y: yExtent / largestExtent, z: 0.45 },
			xaxis: { ...coordinateAxis('X', x, physical), showbackground: true, backgroundcolor: '#f8fbfe' },
			yaxis: { ...coordinateAxis('Y', y, physical), showbackground: true, backgroundcolor: '#f8fbfe' },
			zaxis: {
				title: { text: `${heightLabel} (mm)`, font: { size: 12 } },
				autorange: false,
				range: [...bounds],
				tickformat: '.3f',
				nticks: 5,
				tickfont: { size: 11 },
				gridcolor: '#dde8f1',
				zerolinecolor: '#9ab8ce',
				showbackground: true,
				backgroundcolor: '#f8fbfe',
			},
		};
		// automargin belongs to Cartesian axes, not the 3D axis schema.
		delete layout.scene.xaxis.automargin;
		delete layout.scene.yaxis.automargin;
		if (Object.hasOwn(FRONT_EDGES, frontEdge)) {
			const axis = frontEdge.endsWith('X') ? layout.scene.xaxis : layout.scene.yaxis;
			axis.title.text += ` · ${frontEdgeText(frontEdge, sampled)}`;
		}
	} else {
		trace.zsmooth = false;
		trace.hoverongaps = false;
		layout.dragmode = 'pan';
		layout.xaxis = { ...coordinateAxis('X', x, physical), autorange: true, constrain: 'domain' };
		layout.yaxis = { ...coordinateAxis('Y', y, physical), autorange: true, constrain: 'domain', scaleanchor: 'x', scaleratio: 1 };
		if (Object.hasOwn(FRONT_EDGES, frontEdge)) {
			const alongX = frontEdge.endsWith('X');
			const low = frontEdge.startsWith('min');
			const centre = axis => (axis[0] + axis.at(-1)) / 2;
			const edge = axis => low ? axis[0] : axis.at(-1);
			layout.annotations = [{
				xref: 'x', yref: 'y', x: alongX ? edge(x) : centre(x), y: alongX ? centre(y) : edge(y),
				text: 'FRONT', textangle: alongX ? -90 : 0, showarrow: false,
				bgcolor: 'rgba(255,255,255,.94)', borderpad: 4, font: { size: 10, color: '#17254d' },
			}];
		}
	}
	const data = [trace];
	if (point && x[point.x] !== undefined && y[point.y] !== undefined) {
		const marker = {
			type: view === 'surface' ? 'scatter3d' : 'scatter',
			mode: 'markers', x: [x[point.x]], y: [y[point.y]],
			marker: { size: 13, color: '#fff', line: { color: '#17254d', width: 3 } },
			showlegend: false, hoverinfo: 'skip', name: 'Inspected point',
		};
		if (view === 'surface') marker.z = [z[point.y][point.x]];
		data.push(marker);
	}
	return { data, layout };
}

/**
 * Render original measurements with explicit orientation/reference options.
 * Auto bounds: max(measured range, .02 mm) around the midpoint, plus 10% on
 * each side. Explicit bounds are used unchanged by the color axis and 3D Z.
 * Width/depth describe the sampled area, not inferred physical bed edges.
 * difference:true accepts an already-referenced after-minus-before heatmap;
 * its diverging scale is symmetric about zero and hover values show a sign.
 * Plotly owns the element's children; callers should keep placeholders outside.
 */
export async function renderMeshPlot(element, values, options = {}) {
	if (!element || typeof element.getBoundingClientRect !== 'function') throw new TypeError('A chart container is required.');
	const { data, layout } = figure(values, options);
	const Plotly = await loadPlotly();
	try {
		return await Plotly.react(element, data, layout, {
			responsive: true,
			displaylogo: false,
			displayModeBar: true,
			scrollZoom: false,
			modeBarButtonsToRemove: ['select2d', 'lasso2d'],
			toImageButtonOptions: { format: 'png', filename: 'bed-mesh', width: 1200, height: 900, scale: 2 },
		});
	} catch (cause) {
		throw new Error(options.view === 'heatmap'
			? 'The heatmap could not be drawn. Try Visualize again.'
			: 'The 3D surface could not be drawn. Choose Heatmap if your browser cannot display 3D charts.', { cause });
	}
}

/** Release Plotly/WebGL resources when clearing or removing a panel. */
export function purgePlot(element) {
	if (element && typeof window !== 'undefined' && typeof window.Plotly?.purge === 'function') window.Plotly.purge(element);
}

export async function resetPlotView(element, view = 'surface') {
	if (!element?._fullLayout) throw new Error('Visualize a mesh before resetting the view.');
	if (view !== 'surface' && view !== 'heatmap') throw new Error('Choose the surface or heatmap view.');
	const Plotly = await loadPlotly();
	return Plotly.relayout(element, view === 'surface'
		? { 'scene.camera': defaultCamera() }
		: { 'xaxis.autorange': true, 'yaxis.autorange': true });
}

export async function downloadPlot(element, filename = 'bed-mesh') {
	if (!element?._fullLayout) throw new Error('Visualize a mesh before saving an image.');
	const Plotly = await loadPlotly();
	const safeFilename = String(filename).replace(/\.png$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'bed-mesh';
	return Plotly.downloadImage(element, { format: 'png', filename: safeFilename, width: 1200, height: 900, scale: 2 });
}
