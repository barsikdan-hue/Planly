import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
await mkdir(root+'dist',{recursive:true});
await build({entryPoints:[root+'main.mjs'],bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:root+'dist/app.js',sourcemap:false,minify:true});
await copyFile(root+'index.html',root+'dist/index.html');
await copyFile(root+'style.css',root+'dist/style.css');
