const { execSync }  = require('child_process')
const packageJson = require('../package.json')

let packageVersion = packageJson.version
// we estimate redux size based on the content length of the minified umd build hosted by unpkg. This script is brittle but works.
let reduxSize = execSync("curl -sIL https://unpkg.com/redux/dist/redux.min.js | grep -i Content-Length | tail -1 | awk '{print $2}'").toString()
// we need to substract redux size from our umd build to get an estimate of our first party code size
let persistSize = execSync("wc -c < dist/redux-persist.min.js") - reduxSize

// note: markdown formatted for conveinence when appending to LIBSIZE.md
console.log(`**v${packageVersion}**: ${persistSize} Bytes  `)
