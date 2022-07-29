let synapse_uat = require('./refactor-synapse-uat')
let synapse_prd = require('./refactor-synapse-prd')
let synctera_prd = require('./refactor-synctera-prd')

async function main() {
    throw('error: this needs to be refactored before it can be used.')
    await synapse_uat.main()
    await synapse_prd.main()
    await synctera_prd.main()
}

main()