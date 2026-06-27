// uplot ships real types at dist/uPlot.d.ts but its package.json has no "types"
// field, so importing the ESM sub-path resolves to `any` under bundler
// resolution. Alias that exact sub-path to the bundled declaration file.
// (Pure ambient module file — no top-level import/export, so it stays global.)
declare module 'uplot/dist/uPlot.esm.js' {
	import uPlot = require('uplot/dist/uPlot');
	export = uPlot;
}
