// Cloudflare Workers imports a `.wasm` file as a WebAssembly.Module. The
// upstream Midnight browser entry expects the file to be an already
// instantiated namespace, so initialise the wasm-bindgen glue explicitly.
import wasmModule from '../../../../node_modules/@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm_bg.wasm';
import * as runtime from '../../../../node_modules/@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm_bg.js';

const imports = {
  './midnight_onchain_runtime_wasm_bg.js': runtime,
};
const instantiated = await WebAssembly.instantiate(wasmModule, imports);
const instance = instantiated instanceof WebAssembly.Instance
  ? instantiated
  : instantiated.instance;

runtime.__wbg_set_wasm(instance.exports);
instance.exports.__wbindgen_start();

export * from '../../../../node_modules/@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm_bg.js';
