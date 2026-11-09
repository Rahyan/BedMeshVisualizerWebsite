/** Pure mesh parsing and statistics. No browser APIs or external dependencies. */

const MAX_DIMENSION = 100;
const MAX_TEXT_LENGTH = 1_000_000;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const MARKED_NUMBER = /\[\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*\]/gi;
const DIMENSION_HEADING = /^(Num|Mesh)\s+X\s*,\s*Y\s*:\s*(\d+)\s*,\s*(\d+)\s*$/i;
const PROBED_HEADING = /^Mesh Leveling Probed Z positions\s*:\s*$/i;
const MARLIN_HEADING = /^(?:Bilinear (?:Bed )?Level(?:ing|ling) Grid|Bed Topography Report|Unified Bed Leveling(?: System.*)?|Mesh Bed Leveling)\s*:?\s*$/i;
const COORDINATE_HEADING = /^bed_mesh:\s*generated points\s*$/i;

function fail(message, line) {
	throw new Error(`${line ? `Line ${line}: ` : ''}${message}`);
}

function validateMesh(values) {
	if (!Array.isArray(values) || values.length === 0) {
		fail('The mesh must contain at least one row of numbers.');
	}
	if (values.length > MAX_DIMENSION) {
		fail(`The mesh is too large; use at most ${MAX_DIMENSION} rows and columns.`);
	}
	const columns = Array.isArray(values[0]) ? values[0].length : 0;
	if (columns === 0) fail('Each mesh row must contain at least one number.');
	if (columns > MAX_DIMENSION) {
		fail(`The mesh is too large; use at most ${MAX_DIMENSION} rows and columns.`);
	}
	for (let row = 0; row < values.length; row++) {
		if (!Array.isArray(values[row]) || values[row].length !== columns) {
			fail(`Row ${row + 1} has ${values[row]?.length ?? 0} values; expected ${columns}. All rows must have the same length.`);
		}
		for (let column = 0; column < columns; column++) {
			if (typeof values[row][column] !== 'number' || !Number.isFinite(values[row][column])) {
				fail(`Row ${row + 1}, column ${column + 1} must contain a finite number; missing values are not supported.`);
			}
		}
	}
	return columns;
}

function stripConsolePrefix(line) {
	// Strip only anchored, recognizable prefixes. In particular, do not replace
	// arbitrary "word:" text: doing so destroys timestamps and useful metadata.
	let result = line.trim();
	for (let pass = 0; pass < 8; pass++) {
		const previous = result;
		result = result
			.replace(/^\[(?:\d{4}-\d{2}-\d{2}[ T])?\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?(?:\s*[AP]M)?\]\s*(?:->|:)?\s*/i, '')
			.replace(/^(?:<\s*)?(?:\d{4}-\d{2}-\d{2}[ T])?\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?(?:\s*[AP]M)?\s*(?:->|:)?\s*/i, '')
			.replace(/^(?:(?:Recv|echo|Send|INFO)\s*:\s*|\/\/\s*)/i, '')
			.trim();
		if (previous === result) break;
	}
	return result;
}

function tokenize(line, lineNumber) {
	const marked = line.replace(MARKED_NUMBER, (match, value, offset, source) => {
		const before = offset === 0 ? '' : source[offset - 1];
		const after = source[offset + match.length] ?? '';
		if ((before && !/[\s,]/.test(before)) || (after && !/[\s,]/.test(after))) {
			fail('Bracketed mesh values must be separated from other values by whitespace or commas.', lineNumber);
		}
		return value;
	});
	const csv = marked.includes(',');
	const tokens = csv ? marked.split(',').map(value => value.trim()) : marked.trim().split(/\s+/);
	if (tokens.some(value => value === '')) fail('A mesh value is missing between separators.', lineNumber);
	const values = tokens.map((token, index) => {
		if (!NUMBER.test(token) || !Number.isFinite(Number(token))) {
			fail(`Column ${index + 1} contains "${token}"; expected a finite number.`, lineNumber);
		}
		return Number(token);
	});
	return { tokens, values, csv, line: lineNumber };
}

function isIndexHeader(record) {
	if (!record || record.label !== undefined || record.csv) return false;
	const { tokens } = record;
	return tokens.every((token, index) => token === String(index)) ||
		tokens.every((token, index) => token === String(tokens.length - index - 1));
}

function areRowLabels(labels) {
	return labels.every((label, index) => label === index) ||
		labels.every((label, index) => label === labels.length - index - 1);
}

function checkHeaders(headers, columns, allowExtra = false) {
	for (const header of headers) {
		if (!isIndexHeader(header) || (header.values.length !== columns && !(allowExtra && header.values.length === columns + 1))) {
			fail(`The numbered column header does not match the ${columns} mesh columns.`, header.line);
		}
	}
}

function hasHistoricalSampleHeader(headers, valueTokens) {
	// Only the old shipped 13x13 signed-decimal report needs this exception.
	// A general off-by-one allowance could hide an entirely missing column.
	return headers.length > 0 && valueTokens.length === 13 &&
		valueTokens.every(tokens => tokens.length === 13 && tokens.every(token => /^[+-]\d+\.\d+$/.test(token))) &&
		headers.every(header => header.tokens.length === 14 && header.tokens.every((token, index) => token === String(index)));
}

function extractNumberedGrid(records, marlin) {
	if (records.some(record => record.label !== undefined)) {
		const rows = records.filter(record => record.label !== undefined);
		const headers = records.filter(record => record.label === undefined);
		if (headers.some(header => header !== records[0] && header !== records.at(-1))) {
			fail('Unexpected text or an unnumbered row inside the numbered mesh.');
		}
		if (!areRowLabels(rows.map(row => row.label))) {
			fail('Mesh row labels must count consecutively from 0, in ascending or descending order. Check for missing or duplicate rows.');
		}
		checkHeaders(headers, rows[0].values.length, hasHistoricalSampleHeader(headers, rows.map(row => row.tokens)));
		return rows.map(row => row.values);
	}

	// An ordinary first row beginning with zero is data. A column header needs
	// a complete sequence of numbered rows and a distinct header width.
	const candidates = [];
	if (isIndexHeader(records[0]) && records.length > 1) candidates.push({ headers: [records[0]], rows: records.slice(1) });
	if (isIndexHeader(records.at(-1)) && records.length > 1) candidates.push({ headers: [records.at(-1)], rows: records.slice(0, -1) });
	if (isIndexHeader(records[0]) && isIndexHeader(records.at(-1)) && records.length > 2) {
		candidates.unshift({ headers: [records[0], records.at(-1)], rows: records.slice(1, -1) });
	}
	for (const { headers, rows } of candidates) {
		if (rows.some(row => row.csv)) continue;
		const columns = rows[0].values.length - 1;
		const normalHeader = headers.every(header => header.values.length === columns);
		const legacySample = hasHistoricalSampleHeader(headers, rows.map(row => row.tokens.slice(1)));
		// Marlin metadata makes an otherwise ambiguous same-width header clear.
		// Recognize that shape to reject its mismatch, not to discard a column.
		const contextualHeader = marlin && headers.every(header => header.values.length === columns + 1);
		if (!normalHeader && !legacySample && !contextualHeader) continue;
		if (rows.some(row => row.values.length !== columns + 1)) continue;
		const labels = rows.map(row => /^(?:0|[1-9]\d*)$/.test(row.tokens[0]) ? Number(row.tokens[0]) : NaN);
		if (!areRowLabels(labels)) {
			fail('Mesh row labels must count consecutively from 0, in ascending or descending order. Check for missing or duplicate rows.');
		}
		checkHeaders(headers, columns, legacySample);
		return rows.map(row => row.values.slice(1));
	}
	return null;
}

/**
 * Parse a single rectangular mesh. Input row order is preserved, including
 * descending Marlin Y labels; the UI can offer an explicit orientation flip.
 * Formats: Marlin, Prusa, Klipper, CSV, JSON, Plain grid.
 * Unknown lines, missing cells and non-finite values are errors, never zeroes.
 * Decimal points are required; commas are column separators, not decimals.
 */
export function parseMesh(text) {
	if (typeof text !== 'string') throw new TypeError('Paste mesh data as text.');
	if (text.length > MAX_TEXT_LENGTH) fail('The pasted data is too large. Use a single mesh of at most 100 rows and columns.');
	const input = text.replace(/^\uFEFF/, '').trim();
	if (!input) fail('Paste a mesh or load an example before visualizing.');
	if (/^\[\s*\[/.test(input)) {
		let values;
		try { values = JSON.parse(input); }
		catch { fail('The JSON mesh is not valid. Use an array of numeric rows, such as [[0, 0.1], [0.2, 0.3]].'); }
		const columns = validateMesh(values);
		return { values, format: 'JSON', rows: values.length, columns };
	}

	const records = [];
	let format = '';
	let dimensions;
	let probedMatrix = false;
	let pointsHeading = false;
	const multipleReports = line => fail('More than one mesh report was found. Paste one grid per panel; choose either the probed points or the interpolated mesh.', line);
	const lines = input.split(/\r\n?|\n/);
	for (let index = 0; index < lines.length; index++) {
		const line = stripConsolePrefix(lines[index]);
		if (!line) continue;
		if (COORDINATE_HEADING.test(line)) {
			fail('Generated probe coordinates are X/Y locations, not a mesh of Z heights. Paste the probed Z positions or interpolated mesh instead.', index + 1);
		}
		const dimensionMatch = line.match(DIMENSION_HEADING);
		if (dimensionMatch) {
			if (dimensions || probedMatrix || records.length) multipleReports(index + 1);
			dimensions = { columns: Number(dimensionMatch[2]), rows: Number(dimensionMatch[3]) };
			format = dimensionMatch[1].toLowerCase() === 'num' ? 'Prusa' : 'Klipper';
			continue;
		}
		if (PROBED_HEADING.test(line)) {
			if (probedMatrix || dimensions || records.length || pointsHeading) multipleReports(index + 1);
			probedMatrix = true;
			format = 'Klipper';
			continue;
		}
		if (MARLIN_HEADING.test(line)) {
			if (records.length || dimensions || probedMatrix) multipleReports(index + 1);
			format ||= 'Marlin';
			continue;
		}
		if (/^(?:Measured|Probed) points\s*:\s*$/i.test(line)) {
			if (records.length || probedMatrix || pointsHeading) multipleReports(index + 1);
			pointsHeading = true;
			continue;
		}
		if (/^(?:G29|G81|BED_MESH_OUTPUT)(?:\s+[A-Z]\S*)*\s*$/i.test(line)) {
			if (records.length) multipleReports(index + 1);
			if (/^G81(?:\s|$)/i.test(line)) format ||= 'Prusa';
			continue;
		}
		if (/^(?:(?:Z\s+)?search height\s*:|Mesh (?:Offets|Offsets|Average|Range)\s*:|Interpolation Algorithm\s*:)/i.test(line) ||
			/^(?:ok(?:\s+\S+)*|busy:\s*processing|Bed Leveling\s+(?:ON|OFF)|Fade Height\s*:?\s*[\d.]+)\s*$/i.test(line)) continue;
		const numbered = line.match(/^(0|[1-9]\d*)\s*\|\s*(.*)$/);
		if (numbered && !numbered[2]) fail('This numbered mesh row has no values.', index + 1);
		const record = tokenize(numbered ? numbered[2] : line, index + 1);
		if (numbered) record.label = Number(numbered[1]);
		records.push(record);
		if (records.length > MAX_DIMENSION + 2) fail('The mesh is too large; use at most 100 rows and columns.');
	}
	if (records.length === 0) fail('No numeric mesh rows were found in the pasted data.');
	const numberedValues = extractNumberedGrid(records, format === 'Marlin');
	const values = numberedValues ?? records.map(record => record.values);
	const columns = validateMesh(values);
	if (dimensions && (dimensions.rows !== values.length || dimensions.columns !== columns)) {
		fail(`The report declares ${dimensions.columns} columns × ${dimensions.rows} rows, but the mesh contains ${columns} columns × ${values.length} rows. Check for missing values or rows.`);
	}
	format ||= numberedValues ? 'Marlin' : records.some(record => record.csv) ? 'CSV' : 'Plain grid';
	return { values, format, rows: values.length, columns };
}

export const MAX_LOG_LENGTH = 2_000_000;

/**
 * Find independently parseable firmware reports. An echoed G29 or G81 can
 * mark an unheaded response. Arbitrary numeric chatter is not a mesh.
 * Keep malformed rows inside a candidate so the strict parser rejects it whole.
 */
export function findMeshReports(text, maxReportLength = MAX_TEXT_LENGTH) {
	if (typeof text !== 'string' || !text.trim()) fail('Paste printer log text to find meshes.');
	if (text.length > MAX_LOG_LENGTH) fail('Use a log of at most 2,000,000 characters. Keep the section around the scans you need.');
	const lines = text.replace(/^\uFEFF/, '').split(/\r\n?|\n/);
	const reports = [];
	let skipped = 0;
	let start = -1;
	let lastRow = -1;
	let command = '';
	let hasBoundary = false;

	function finish() {
		if (start === -1) return;
		if (lastRow > start) {
			const block = lines.slice(start, lastRow + 1);
			if (command) block[0] = command;
			const raw = block.join('\n');
			try {
				if (raw.length > maxReportLength) fail('This report is too large for a mesh panel.');
				const parsed = parseMesh(raw);
				if (command === 'G29' && parsed.format !== 'Marlin') fail('Expected a numbered G29 mesh.');
				const heading = stripConsolePrefix(block[0]);
				const label = PROBED_HEADING.test(heading) ? 'Klipper probed Z' : parsed.format;
				reports.push({ ...parsed, label, raw, firstLine: start + 1, lastLine: lastRow + 1 });
			} catch {
				skipped++;
			}
		} else if (!command) {
			skipped++;
		}
		start = -1;
		lastRow = -1;
		command = '';
	}

	for (const [index, raw] of lines.entries()) {
		const line = stripConsolePrefix(raw);
		const heading = DIMENSION_HEADING.test(line) || PROBED_HEADING.test(line) || MARLIN_HEADING.test(line);
		const echoed = line.match(/^(?:N\d+\s+)?(G29|G81)(?:\s+[A-Z]\S*)*(?:\*\d+)?\s*$/i);
		if (heading || echoed) {
			// A second heading before any grid can refine the echoed command or
			// a Marlin preamble. The most specific heading owns the numeric rows.
			if (lastRow > start) finish();
			start = index;
			command = echoed ? echoed[1].toUpperCase() : '';
			hasBoundary = true;
		} else if (COORDINATE_HEADING.test(line) || /(?:^|\s)Send\s*:/i.test(raw) ||
			/^(?:ok(?:\s|$)|[BT]\d*:\s*[+-]?\d|(?:G29|BED_MESH_OUTPUT)(?:\s|$))/i.test(line)) {
			finish();
		} else if (start !== -1 && /^(?:[+\-.,?\[\d]|nan\b|infinity\b)/i.test(line)) {
			lastRow = index;
		}
		if (reports.length + skipped > 50) fail('This log has more than 50 mesh sections. Keep the part around the scans you want to compare.');
	}
	finish();
	if (reports.length + skipped > 50) fail('This log has more than 50 mesh sections. Keep the part around the scans you want to compare.');
	if (!hasBoundary && text.length <= maxReportLength) {
		try {
			const parsed = parseMesh(text);
			reports.push({ ...parsed, label: parsed.format, raw: text, firstLine: 1, lastLine: lines.length });
		}
		catch { /* A plain grid is accepted only when the complete input parses. */ }
	}
	return { reports, skipped };
}

/** Signed arithmetic mean and population standard deviation, in input units. */
export function calculateStats(values) {
	const columns = validateMesh(values);
	let min = Infinity;
	let max = -Infinity;
	for (const row of values) for (const value of row) {
		min = Math.min(min, value);
		max = Math.max(max, value);
	}
	const range = max - min;
	if (!Number.isFinite(range)) fail('Mesh values are too large to calculate finite statistics.');
	const scale = Math.max(Math.abs(min), Math.abs(max));
	if (scale === 0) return { mean: 0, std: 0, min, max, range };
	const count = values.length * columns;
	let sum = 0;
	let correction = 0;
	for (const row of values) for (const value of row) {
		const next = value / scale - correction;
		const total = sum + next;
		correction = (total - sum) - next;
		sum = total;
	}
	const normalizedMean = sum / count;
	let squaredDifferences = 0;
	correction = 0;
	for (const row of values) for (const value of row) {
		const next = (value / scale - normalizedMean) ** 2 - correction;
		const total = squaredDifferences + next;
		correction = (total - squaredDifferences) - next;
		squaredDifferences = total;
	}
	return { mean: normalizedMean * scale, std: Math.sqrt(squaredDifferences / count) * scale, min, max, range };
}

function sumMeshTerms(values, term) {
	let sum = 0;
	let correction = 0;
	for (let y = 0; y < values.length; y++) for (let x = 0; x < values[y].length; x++) {
		const next = term(values[y][x], x, y) - correction;
		const total = sum + next;
		correction = (total - sum) - next;
		sum = total;
	}
	return sum;
}

function meshOffsets(values) {
	const stats = calculateStats(values);
	const rows = values.length;
	const columns = values[0].length;
	const base = values[0][0];
	// Fit offsets from a source measurement, so a large common Z offset does
	// not swallow a small, representable tilt. Normalize before weighted sums.
	const scale = stats.range || 1;
	const normalized = values.map(row => row.map(value => (value - base) / scale));
	const mean = sumMeshTerms(normalized, value => value) / (rows * columns);
	return { rows, columns, base, scale, normalized, mean };
}

function fitMeshPlane(context) {
	const { rows, columns, base, scale, normalized, mean } = context;
	if (rows < 2 || columns < 2) throw new Error('A fitted plane needs at least two rows and two columns.');
	const xCenter = (columns - 1) / 2;
	const yCenter = (rows - 1) / 2;
	// A complete regular Cartesian grid has orthogonal centered X/Y terms.
	const xDenominator = rows * columns * (columns ** 2 - 1) / 12;
	const yDenominator = columns * rows * (rows ** 2 - 1) / 12;
	const xSlope = sumMeshTerms(normalized, (value, x) => (x - xCenter) * (value - mean)) / xDenominator;
	const ySlope = sumMeshTerms(normalized, (value, x, y) => (y - yCenter) * (value - mean)) / yDenominator;
	const normalizedIntercept = mean - xSlope * xCenter - ySlope * yCenter;
	const interceptOffset = normalizedIntercept * scale;
	const intercept = Number.isFinite(interceptOffset)
		? base + interceptOffset
		: (base / scale + normalizedIntercept) * scale;
	const plane = {
		xRise: xSlope * (columns - 1) * scale,
		yRise: ySlope * (rows - 1) * scale,
		intercept,
		xSlope: xSlope * scale,
		ySlope: ySlope * scale,
	};
	if (!Object.values(plane).every(Number.isFinite)) fail('Mesh values are too large to fit a finite plane.');
	const residuals = normalized.map((row, y) => row.map((value, x) =>
		(value - (mean + xSlope * (x - xCenter) + ySlope * (y - yCenter))) * scale));
	if (residuals.some(row => row.some(value => !Number.isFinite(value)))) fail('Mesh values are too large to calculate finite plane residuals.');
	return { plane, residuals };
}

/**
 * Additional analysis of the original measurements. Plane slopes are mm per
 * sample-index step; rises are signed mm from first to last column/row.
 * Residuals remove z = xSlope*x + ySlope*y + intercept by least squares.
 * One-dimensional meshes return null plane/residual metrics and canFitPlane
 * false, while median and mean absolute deviation remain available.
 */
export function analyzeMesh(values) {
	const context = meshOffsets(values);
	const sorted = values.flat().sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	const median = sorted.length % 2 ? sorted[middle] : sorted[middle - 1] + (sorted[middle] - sorted[middle - 1]) / 2;
	const meanAbsDeviation = sumMeshTerms(context.normalized, value => Math.abs(value - context.mean)) / sorted.length * context.scale;
	const canFitPlane = context.rows >= 2 && context.columns >= 2;
	if (!canFitPlane) return { median, meanAbsDeviation, plane: null, residualRange: null, residualRms: null, canFitPlane };
	const { plane, residuals } = fitMeshPlane(context);
	let min = Infinity;
	let max = -Infinity;
	for (const row of residuals) for (const value of row) {
		min = Math.min(min, value);
		max = Math.max(max, value);
	}
	const residualRange = max - min;
	const residualScale = Math.max(Math.abs(min), Math.abs(max));
	const residualRms = residualScale === 0 ? 0
		: Math.sqrt(sumMeshTerms(residuals, value => (value / residualScale) ** 2) / sorted.length) * residualScale;
	if (![median, meanAbsDeviation, residualRange, residualRms].every(Number.isFinite)) fail('Mesh values are too large to calculate finite plane analysis.');
	return { median, meanAbsDeviation, plane, residualRange, residualRms, canFitPlane };
}

/** Return a fresh matrix of signed heights relative to the fitted plane. */
export function removeFittedTilt(values) {
	return fitMeshPlane(meshOffsets(values)).residuals;
}

/** Export numeric cells only. No header, row labels, units, or rounding. */
export function exportMeshCsv(values) {
	validateMesh(values);
	return values.map(row => row.join(',')).join('\n');
}

/** Return a new matrix; never change the parsed source mesh. */
export function transformMesh(values, { flipX = false, flipY = false, center = false } = {}) {
	validateMesh(values);
	if ([flipX, flipY, center].some(value => typeof value !== 'boolean')) throw new TypeError('Mesh transformation options must be true or false.');
	const mean = center ? calculateStats(values).mean : 0;
	const result = values.map(row => {
		const transformed = row.map(value => value - mean);
		return flipX ? transformed.reverse() : transformed;
	});
	return flipY ? result.reverse() : result;
}
