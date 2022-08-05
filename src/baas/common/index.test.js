const common = require('./index')();

it('baas.common.formatMoney - with amount = "nope" and expect "error: amount was not a valid number"', async () => {
    try{
        const data = await common.formatMoney( {amount: "nope"} );
    } catch (error) {
        expect.assertions(1);
        expect(error).toEqual('error: amount was not a valid number');
    }
});

it('baas.common.formatMoney - with amount = "100" and decimalPosition="nope" expect "error: amount was not a valid number"', async () => {
    try{
        const data = await common.formatMoney( {amount: "100", decimalPosition: "nope"} );
    } catch (error) {
        expect.assertions(1);
        expect(error).toEqual('error: decimalPosition was not a valid number');
    }
});

it('baas.common.formatMoney - with amount = 100 and expect "100.00"', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: 100} );
    expect(data).toEqual('100.00');
});

it('baas.common.formatMoney - with amount = 100 and addDollarSign = true and expect "100.00"', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: 100, addDollarSign: true} );
    expect(data).toEqual('$100.00');
});

it('baas.common.formatMoney - with amount = undefined and expect "0.00"', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: undefined} );
    expect(data).toEqual('0.00');
});

it('baas.common.formatMoney - with amount = null and expect "0.00"', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: null} );
    expect(data).toEqual('0.00');
});

it('baas.common.formatMoney - with amount = "0" and expect "$0.00" with addDollarSign = true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '0', addDollarSign: true} );
    expect(data).toEqual('$0.00');
});

it('baas.common.formatMoney - with amount = "-000" and expect "0.00" with addDollarSign = false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '-000', addDollarSign: false} );
    expect(data).toEqual('0.00');
});

it('baas.common.formatMoney - with amount = "-000" and expect "$0.00" with addDollarSign = true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '-000', addDollarSign: true} );
    expect(data).toEqual('$0.00');
});

it('baas.common.formatMoney - with amount = "0" and expect "0.00" with addDollarSign = false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '0', addDollarSign: false} );
    expect(data).toEqual('0.00');
});

it('baas.common.formatMoney - with amount = "-1" and expect "-1.00" with addDollarSign = false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '-1', addDollarSign: false} );
    expect(data).toEqual('-1.00');
});

it('baas.common.formatMoney - with amount = "(1)" and expect "-1.00" with addDollarSign = false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '(1)', addDollarSign: false} );
    expect(data).toEqual('-1.00');
});

it('baas.common.formatMoney - with amount = "-10" and expect "-0.10" with decimalPosition=2 and addDollarSign = false and addComma=false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '-10', decimalPosition: 2, addDollarSign: false, addComma: false} );
    expect(data).toEqual('-0.10');
});

it('baas.common.formatMoney - with amount = "(10)" and expect "-0.10" with decimalPosition=2 and addDollarSign = false and addComma=false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '(10)', decimalPosition: 2, addDollarSign: false, addComma: false} );
    expect(data).toEqual('-0.10');
});

it('baas.common.formatMoney - with amount = "10" and expect "0.10" with decimalPosition=2 and addDollarSign = false and addComma=false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '10', decimalPosition: 2, addDollarSign: false, addComma: false} );
    expect(data).toEqual('0.10');
});

it('baas.common.formatMoney - with amount = "-1" and expect "-0.01" with decimalPosition=2 and addDollarSign = false and addComma=false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '-1', decimalPosition: 2, addDollarSign: false, addComma: false} );
    expect(data).toEqual('-0.01');
});

it('baas.common.formatMoney - with amount = "(1)" and expect "-0.01" with decimalPosition=2 and addDollarSign = false and addComma=false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '(1)', decimalPosition: 2, addDollarSign: false, addComma: false} );
    expect(data).toEqual('-0.01');
});

it('baas.common.formatMoney - with amount = "(10)" and expect "-0.10" with decimalPosition=2 and addDollarSign = false and addComma=false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '(10)', decimalPosition: 2, addDollarSign: false, addComma: false} );
    expect(data).toEqual('-0.10');
});

it('baas.common.formatMoney - with amount = "1" and expect "0.01" with decimalPosition=2 and addDollarSign = false and addComma=false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '1', decimalPosition: 2, addDollarSign: false, addComma: false} );
    expect(data).toEqual('0.01');
});

it('baas.common.formatMoney - with amount = "(1)" and expect "-1.00" with decimalPosition=0 and addDollarSign = false and addComma=false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '(1)', decimalPosition: 0, addDollarSign: false, addComma: false} );
    expect(data).toEqual('-1.00');
});

it('baas.common.formatMoney - with amount = "100.0" and expect "100.00" with addDollarSign = false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '100.0', addDollarSign: false} );
    expect(data).toEqual('100.00');
});

it('baas.common.formatMoney - with amount = "1000" and expect "1000.00" with addDollarSign=false and addComma=false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '1000', addDollarSign: false} );
    expect(data).toEqual('1000.00');
});

it('baas.common.formatMoney - with amount = "1000" and expect "1,000.00" with addDollarSign=false and addComma=true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '1000', addComma: true} );
    expect(data).toEqual('1,000.00');
});

it('baas.common.formatMoney - with amount = "1000" and expect "$1,000.00" with addDollarSign=true and addComma=true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '1000', addDollarSign: true, addComma: true} );
    expect(data).toEqual('$1,000.00');
});

it('baas.common.formatMoney - with amount = "1234" and expect "$1,234.00" with addDollarSign=true and addComma=true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '1234', addDollarSign: true, addComma: true} );
    expect(data).toEqual('$1,234.00');
});

it('baas.common.formatMoney - with amount = "123456" and expect "$1,234.56" with addDollarSign=true and addComma=true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '123456', decimalPosition: 2, addDollarSign: true, addComma: true} );
    expect(data).toEqual('$1,234.56');
});

it('baas.common.formatMoney - with amount = "123456" and expect "$1,234.56" with addDollarSign=false and addComma=true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '123456', decimalPosition: 2, addDollarSign: false, addComma: true} );
    expect(data).toEqual('1,234.56');
});

it('baas.common.formatMoney - with amount = "123456" and expect "$1,234.56" with addDollarSign=true and addComma=false', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '123456', decimalPosition: 2, addDollarSign: true, addComma: false} );
    expect(data).toEqual('$1234.56');
});

it('baas.common.formatMoney - with amount = "1234567890" and expect "$12,345,678.90" with addDollarSign=true and addComma=true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '1234567890', decimalPosition: 2, addDollarSign: true, addComma: true} );
    expect(data).toEqual('$12,345,678.90');
});

it('baas.common.formatMoney - with amount = "-1234567890" and expect "$-12,345,678.90" with addDollarSign=true and addComma=true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '-1234567890', decimalPosition: 2, addDollarSign: true, addComma: true} );
    expect(data).toEqual('$-12,345,678.90');
});

it('baas.common.formatMoney - with amount = "(1234567890)" and expect "$-12,345,678.90" with addDollarSign=true and addComma=true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '(1234567890)', decimalPosition: 2, addDollarSign: true, addComma: true} );
    expect(data).toEqual('$-12,345,678.90');
});

it('baas.common.formatMoney - with amount = "12345678" and expect "$12,345.678" with decimalPosition=3 and addDollarSign=true and addComma=true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '12345678', decimalPosition: 3, addDollarSign: true, addComma: true} );
    expect(data).toEqual('$12,345.678');
});

it('baas.common.formatMoney - with amount = "12345678" and expect "12,345.678" with decimalPosition=3 and addDollarSign=false and addComma=true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '12345678', decimalPosition: 3, addDollarSign: false, addComma: true} );
    expect(data).toEqual('12,345.678');
});

it('baas.common.formatMoney - with amount = "9007199254740991" and expect "90,071,992,547,409.91" with decimalPosition=2 and addDollarSign=false and addComma=true', async () => {
    expect.assertions(1);
    const data = await common.formatMoney( {amount: '9007199254740991', decimalPosition: 2, addDollarSign: false, addComma: true} );
    expect(data).toEqual('90,071,992,547,409.91');
});

it('baas.common.formatMoney - with amount = "9997199254740992" expect "error: amount was higher than 9007199254740991 and this is an unsafe integer"', async () => {
    try{
        const data = await common.formatMoney( {amount: "9997199254740992"} );
    } catch (error) {
        expect.assertions(1);
        expect(error).toEqual('error: amount was higher than 9007199254740991 and this is an unsafe integer');
    }
});