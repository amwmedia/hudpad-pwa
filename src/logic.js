console.clear();
const rAF = window.requestAnimationFrame;
const config = JSON.parse(localStorage.getItem('config') || '{}');

const saveConfig = () => localStorage.setItem('config', JSON.stringify(config));
const size = 8;
const canvas = {
	createCanvas(w, h) {
		const elem = document.createElement('canvas');
		elem.width = w;
		elem.height = h;
		return elem;
	}
};
const sceneCtx = document.getElementsByTagName('canvas')[0].getContext('2d');
sceneCtx.font = '10px 5X5';

const marqueeAction = (function() {
	const defaults = {
		speed: 0.15
	};
	const size = 8;
	return {
		update(state, ctx) {
				const {
					x, width, speed, text
				} = Object.assign({}, defaults, state);
				state.width = ctx.measureText(text).width;
				if (x == null) {
					state.x = size + speed;
				} else if (state && x != null) {
					state.x -= speed;
					if (x < (width * -1.1)) {
						state.x = size;
					}
				}
				return state;
			},
			draw({
				text, x
			}, ctx) {
				ctx.beginPath();
				ctx.clearRect(0, 0, size, size);
				ctx.fillText(text, x, 7);
			}
	};
})();

const noop = () => {};
let onDraw = noop;
const sceneAlphaMap = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const createScene = (col, row) => ({
	col, row, letter: sceneAlphaMap[row],
		overviewHandlers: [],
		overviewCtx: canvas.createCanvas(size, 1).getContext('2d'),
		overviewUpdate: noop,
		overviewDraw: noop,
		sceneHandlers: [],
		sceneUpdate: noop,
		sceneDraw: noop,
		pixelCtx: canvas.createCanvas(1, 1).getContext('2d'),
		pixelUpdate: noop,
		pixelDraw: noop,
});

const state = {
	systemError: null,
	scenes: (new Array(8)).fill('').map(
		(col, colIdx) => (new Array(8)).fill('').map(
			(row, rowIdx) => createScene(colIdx, rowIdx)
		)
	),
	col: null,
	row: null,
	currentScene: null,
};

const update = () => {
	const {
		currentScene, scenes, col, row, systemError
	} = state;
	if (systemError != null) {
		state.systemError = marqueeAction.update(systemError, sceneCtx);
	} else if (col == null) {
		scenes.forEach((page, colIdx) => {
			page.forEach((scene, rowIdx) => {
				scene.pixelUpdate({
					ctx: scene.pixelCtx
				});
			})
		});
	} else if (row == null) {
		const page = scenes[col];
		page.forEach(({
			overviewUpdate, overviewCtx
		}) => {
			overviewUpdate({
				ctx: overviewCtx,
				size
			});
		});
	} else if (currentScene != null) {
		currentScene.sceneUpdate({
			ctx: sceneCtx,
			size
		});
	}

	draw();
};

const draw = () => {
	const {
		currentScene, scenes, col, row, systemError
	} = state;

	if (systemError != null) {
		marqueeAction.draw(systemError, sceneCtx);
	} else if (col == null) {
		scenes.forEach((page, colIdx) => {
			page.forEach((scene, rowIdx) => {
				scene.pixelDraw({
					ctx: scene.pixelCtx
				});
				sceneCtx.putImageData(scene.pixelCtx.getImageData(0, 0, 1, 1), colIdx,
					rowIdx);
			});
		})
	} else if (row == null) {
		const page = scenes[col];
		page.forEach(({
			overviewDraw, overviewCtx, row
		}) => {
			overviewDraw({
				ctx: overviewCtx,
				size
			});
			const rowImgData = overviewCtx.getImageData(0, 0, 8, 1);
			// console.log('rowImgData', rowImgData, row);
			sceneCtx.putImageData(rowImgData, 0, row);
		});
	} else if (currentScene != null) {
		currentScene.sceneDraw({
			ctx: sceneCtx,
			size
		});
	}

	const imgData = sceneCtx.getImageData(0, 0, size, size).data
		.filter((v, i) => (i + 1) % 4 === 0)
		.reduce((acc, v, i, arr) => {
			const row = acc.length - 1;
			const col = acc[row].length;
			const pixelView = state.col == null && state.row == null;
			const pixelHasCfg = config[col] && config[col][row];
			acc[row].push(
				(v > 150 ? [col, row, pad.amber.full] : (v > 125 ? [col, row, pad.amber.medium] :
					(v > 100 ? [col, row, pad.amber.low] : (pixelView && pixelHasCfg ? [
						col, row, pad.green.medium
					] : [col, row, pad.off]))))
			);
			if ((i + 1) % 8 === 0 && i < (arr.length - 1)) {
				acc.push([]);
			}
			return acc;
		}, [
			[]
		]);

	let buttonData = imgData.reduce((acc, v) => acc.concat(v), []);
	// console.clear();
	for (let btnIdx = 8; btnIdx--;) {
		buttonData.push(
			// top buttons
			[btnIdx, 8, (col === btnIdx ? pad.green : (scenes[btnIdx].some(r => r.pixelDraw !==
				noop) ? pad.amber.low : pad.off))],
			// side buttons
			[8, btnIdx, (row === btnIdx ? pad.green : (col == null || scenes[col][
				btnIdx
			].pixelDraw === noop ? pad.off : pad.amber.low))]
		);
		// console.log('btnIdx', btnIdx);
	}

	pad.setColors(buttonData);
	onDraw(buttonData);
	// console.log(imgData.reduce((acc, v) => acc.concat(v), []));
	rAF(update);
};

const launchApi = scene => ({
	overview: {
		update: f => scene.overviewUpdate = f,
		draw: f => scene.overviewDraw = f,
		onKey: f => {
			scene.overviewHandlers.push(f);
			return () => scene.overviewHandlers = scene.overviewHandlers.filter(h =>
				h !== f);
		}
	},
	scene: {
		update: f => scene.sceneUpdate = f,
		draw: f => scene.sceneDraw = f,
		onKey: f => {
			scene.sceneHandlers.push(f);
			return () => scene.sceneHandlers = scene.sceneHandlers.filter(h => h !==
				f);
		}
	},
	pixel: {
		update: f => scene.pixelUpdate = f,
		draw: f => scene.pixelDraw = f
	},
	marquee: marqueeAction,
});

const unloadSceneAtLocation = (colIdx, rowIdx) => {
	delete config[colIdx][rowIdx];
	if (Object.keys(config[colIdx]).length === 0) {
		delete config[colIdx];
	}
	state.scenes[colIdx][rowIdx] = createScene(colIdx, rowIdx);
	saveConfig();
};
const loadSceneAtLocation = (sceneName, colIdx, rowIdx) => {
	try {
		const sceneFn = window.hudpad.scripts.find(s => s.name === sceneName).script;
		sceneFn(launchApi(state.scenes[colIdx][rowIdx]));
		saveConfig();
	} catch (err) {
		console.error(
			err.message,
			`ERROR LOADING (page ${colIdx + 1}, row ${sceneAlphaMap[rowIdx]})`,
			0,
			function() {
				unloadSceneAtLocation(colIdx, rowIdx);
			}
		);
	}
};

let keyDownTimer;
const init = () => {
	pad.on('key', k => {
		// Make button red while pressed, green after pressing
		const {
			x, y, pressed
		} = k;
		const {
			col, row, scenes
		} = state;

		clearTimeout(keyDownTimer)
		if (col == null && row == null && x < 8 && y < 8 && pressed) {
			keyDownTimer = setTimeout(() => {
				const hasConfig = config[x] != null && config[x][y] != null;
				if (hasConfig) {
					unloadSceneAtLocation(x, y);
				} else {
					// dialog.fileselect('pick a file', 'pick a file title', null, function (code, val) {
					// 	const filePath = val
					// 	.replace(/:/g, '/')
					// 	.replace('HD/', '/')
					// 	.replace('sh ', '');
					// 	if (filePath && filePath.endsWith('.js')) {
					console.log('window.hudpad', window.hudpad);
					config[x] = config[x] || {};
					config[x][y] = window.hudpad.scripts[0].name;
					loadSceneAtLocation(window.hudpad.scripts[0].name, x, y);
					// 	}
					// });
				}
			}, 2000);
		}

		if (y === 8 && !pressed) {
			// col change
			state.col = (col === x ? null : x);
			if (state.col == null) {
				state.row = null;
			}
		} else if (x === 8 && !pressed && col != null) {
			// row change
			state.row = (row === y ? null : y);
		} else if (x < 8 && y < 8 && col != null && row == null && scenes[col][y].pixelDraw !==
			noop && !pressed) {
			// overview key pressed
			scenes[col][y].overviewHandlers.forEach(h => h(x));
		} else if (x < 8 && y < 8 && col != null && row != null && !pressed) {
			// scene key pressed
			scenes[col][row].sceneHandlers.forEach(h => h(x, y));
		} else if (x < 8 && y < 8 && scenes[x][y].pixelDraw !== noop && !pressed) {
			// jump into the selected function
			if (col == null && scenes[x][y].pixelDraw !== noop) {
				state.col = x;
				state.row = y;
			}
		}

		state.currentScene = (state.col != null && state.row != null ? scenes[
			state.col][state.row] : null);
	});
	draw();
};

let pad = new Launchpad();
pad.connect().then(() => {
	// load scenes
	state.scenes.forEach((page, colIdx) => {
		if (config[colIdx] == null) {
			return;
		}
		page.forEach((scene, rowIdx) => {
			const sceneName = config[colIdx][rowIdx];
			if (sceneName == null) {
				return;
			}
			if (window.hudpad.scripts.find(s => s.name === sceneName) == undefined) {
				console.error(
					`NOT FOUND: "${sceneName}"`,
					`ERROR LOADING (page ${colIdx + 1}, row ${sceneAlphaMap[rowIdx]})`,
					0,
					function() {
						unloadSceneAtLocation(colIdx, rowIdx);
					}
				);
			} else {
				loadSceneAtLocation(sceneName, colIdx, rowIdx);
			}
		})
	});
	// run!
	init();
});
