// Marks es/ as native ES modules for Node; lib/ stays CommonJS. sideEffects is
// repeated here because bundlers read the nearest package.json.
import { writeFileSync } from 'fs'

writeFileSync('es/package.json', JSON.stringify({ type: 'module', sideEffects: false }, null, 2) + '\n')
