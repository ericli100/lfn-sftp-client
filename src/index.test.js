const path = require('path');
const { exec } = require('child_process');

test('Checks version command.', async () => {
    let result = await  cli(['-V'], '.');
    expect(result.code).toBe(0);
});
  
function cli(args, cwd) {
    return new Promise(resolve => { 
        exec(`node ${path.resolve('./src/index')} ${args.join(' ')}`,
        { cwd }, 
        (error, stdout, stderr) => { resolve({
        code: error && error.code ? error.code : 0,
        error,
        stdout,
        stderr })
    })
})}
