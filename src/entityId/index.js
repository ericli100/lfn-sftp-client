'user strict';

const intformat = require('biguint-format');
const FlakeId = require('flake-idgen');
const flakeId = new FlakeId();

async function generateFlakeId () {
  let newFlakeId = await intformat(flakeId.next(), 'hex');
  return newFlakeId;
}

async function main() {
    let newId = await generateFlakeId()
    console.log(newId)
}

main()

module.exports = function constructor () {
    function getFlakeId() {
        return Promise.resolve(generateFlakeId());
    }

    return {
        getFlakeId
    };
};