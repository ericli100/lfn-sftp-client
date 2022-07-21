'use strict';

const intformat = require('biguint-format');
const FlakeId = require('flake-idgen');
const flakeId = new FlakeId();

async function generateFlakeId () {
  let newFlakeId = await intformat(flakeId.next(), 'hex');
  return newFlakeId;
}

function generate() {
    return intformat(flakeId.next(), 'hex')
}

async function main() {
    let newId = await generateFlakeId()
    console.log(newId)
}

// adds a main function call to export a FlakeId on demand from the command line.
main()

module.exports = function constructor () {
    function getFlakeId() {
        return Promise.resolve(generateFlakeId());
    }

    return {
        getFlakeId
    };
};

module.exports.generate = generate