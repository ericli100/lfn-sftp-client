'use strict';
/*
    common functions module
*/

let DEBUG = global.DEBUG

function Handler() {
    Handler.formatMoney = async function formatMoney({ amount, decimalPosition, addDollarSign, addComma }) {
        if (amount === null) amount = '0';
        if (!amount) amount = '0';

        if(!decimalPosition) decimalPosition = 0
        if(!addDollarSign) addDollarSign = false
        if(!addComma) addComma = false
        
        let Original = amount

        if(typeof amount !== 'string') { amount = amount.toString() }
         // console.log('Input Amount:', amount)
     
        try {
             let a = '';
             let c = '';
             let n = '';

             // if we have an accounting negative value, make it a regular negative
             if(amount.indexOf('(')==0 && amount.indexOf(')')> 0){
                n = '-'
                amount = amount.substring(1, amount.length)
                amount = amount.substring(0, amount.length -1)
                amount = '-' + amount
             }

             // we have a negative value
             if(amount.indexOf('-')==0){
                n = '-'
                amount = amount.substring(1, amount.length)
                if(amount.length <= decimalPosition) {
                    if (amount.length == 2) { amount = '0' + amount }
                }
    
                if(amount == '000') {
                    // if 3 zeros and marked negative, just take the negative off
                    n = ''
                    amount = '0'
                }
             }

            if(isNaN( parseInt(amount) )) {
                throw('error: amount was not a valid number')
            }

            if(isNaN( decimalPosition ) ) {
                throw('error: decimalPosition was not a valid number')
            }

            if(parseInt(amount) > 9007199254740991) {
                throw('error: amount was higher than 9007199254740991 and this is an unsafe integer')
            }
    
             if(amount.indexOf('.')>0){
                // we have a decimal included in the amount
                 let howManyCents = amount.substring( amount.indexOf('.') + 1 , amount.length);
                 if(howManyCents.length === 1) amount = amount + '0';
                 
                 a = amount.substring(0, amount.length - 3)
                 c = amount.substring( amount.indexOf('.') + 1 , amount.length);
             } else if (decimalPosition > 0) {
                // the decimal position is greater than zero
                if (amount.length == 2) { amount = '0' + amount }

                if(amount.length <= decimalPosition) {
                    amount =  '00' + amount 
                }
                 a = amount.substring(0, amount.length - decimalPosition)
                 c = amount.substring(amount.length - decimalPosition, amount.length)
             } else {
                 a = amount
                 c = '00'
             }
     
             if(addComma) {
                a = a
                    .toString() // transform the number to string
                    .split("") // transform the string to array with every digit becoming an element in the array
                    .reverse() // reverse the array so that we can start process the number from the least digit
                    .map((digit, index) =>
                        index != 0 && index % 3 === 0 ? `${digit},` : digit
                    ) // map every digit from the array.
                    // If the index is a multiple of 3 and it's not the least digit,
                    // that is the place we insert the comma behind.
                    .reverse() // reverse back the array so that the digits are sorted in correctly display order
                    .join(""); // transform the array back to the string
                
                // console.log('Output Amount:',Original,"Output:", '$' + n + a + '.' + c)

                if(addDollarSign) return '$' + n + a + '.' + c
                return n + a + '.' + c
             } else {
                a = a
                    .toString() // transform the number to string
                    .split("") // transform the string to array with every digit becoming an element in the array
                    .reverse() // reverse the array so that we can start process the number from the least digit
                    .map((digit, index) =>
                        index != 0 && index % 3 === 0 ? `${digit}` : digit
                    ) // map every digit from the array.
                    // If the index is a multiple of 3 and it's not the least digit,
                    // that is the place we insert the comma behind.
                    .reverse() // reverse back the array so that the digits are sorted in correctly display order
                    .join(""); // transform the array back to the string
                
                // console.log('Output Amount:',Original,"Output:", '$' + n + a + '.' + c)

                if(addDollarSign) return '$' + n + a + '.' + c
                return n + a + '.' + c
             }
         } catch (e) {
           throw e
         }
    }

    return Handler
}

module.exports = Handler;