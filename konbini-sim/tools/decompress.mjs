// Re-write a meshopt-compressed GLB without EXT_meshopt_compression / quantisation,
// for hosts whose CSP forbids WebAssembly.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
const [inp, out] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
for (const e of doc.getRoot().listExtensionsUsed()) if (/meshopt|quantization/.test(e.extensionName)) e.dispose();
await doc.transform(dequantize());
await io.write(out, doc);
