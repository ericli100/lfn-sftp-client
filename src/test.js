function formatMoney(amount, decimalPosition = 0) {
    let Original = amount
    if (amount === null) return;
    if(typeof amount !== 'string') { amount = amount.toString() }
 
    try {
         let a = '';
         let c = '';
         let n = '';
         if(amount.indexOf('-')==0){
             n = '-'
             amount = amount.substring(1, amount.length)
         }

         if(amount.indexOf('(')==0 && amount.indexOf(')')> 0){
            n = '-'
            amount = amount.substring(1, amount.length)
            amount = amount.substring(0, amount.length -1)
         }

         if(amount.indexOf('.')>0){
             a = amount.substring(0, amount.length - 3)
             c = amount.substring( amount.indexOf('.') + 1 , amount.length);
         } else if (decimalPosition > 0) {
             a = amount.substring(0, amount.length - decimalPosition)
             c = amount.substring(amount.length - decimalPosition, amount.length)
         } else {
             a = amount
             c = '00'
         }
 
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
         console.log('Amount:',Original,"Output:", '$' + n + a + '.' + c)
         return '$' + n + a + '.' + c
 
     } catch (e) {
       console.log(e)
       throw e
     }
 };

 formatMoney(100)
 formatMoney(1000)
 formatMoney(100.34)
 formatMoney(100.00)
 formatMoney(1000070, 2)
 formatMoney("100")
 formatMoney("100.00")
 formatMoney("1000000.43")
 formatMoney("100034", 2)
 formatMoney("100000000000000055")
 formatMoney("100000000000000000023", 2)
 formatMoney(-200)
 formatMoney(-2000)
 formatMoney("(345.22)")