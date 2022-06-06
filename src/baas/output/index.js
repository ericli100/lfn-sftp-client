'user strict';
/*
    Output Files module
*/
const fs = require('fs');
const path = require('node:path');

const papa = require('papaparse');
const parseCSV = papa.unparse

async function fileActivity(vendor, mssql, date, accountNumber) {
    let output = {};

    // call SQL and lookup file activity by date and GL account

    // file name
    let f1 = `{account_number}_file_activity_YYYYMMDDHHMMSS.csv`
    let header = `Date (YYYY/MM/DD),Account Number,Account Name,File Name,Incoming / Outgoing,Credit Count,Credit Amount,Debit Count,Debit Amount`

    // parse results to CSV
    let example = `
    Date (YYYY/MM/DD),Account Number,Account Name,File Name,Incoming / Outgoing,Credit Count,Credit Amount,Debit Count,Debit Amount
    2021/12/3,404404550334,Synapse FBO Account,"nextday_ach_YYYYMMDDHHMMSS_{index}.ach",Outgoing,23,20345.56,31,10546.56`

    let sqlStatement = `
    SELECT CONVERT(varchar, t.[originationDate], 111) AS [Date]
        ,('30-2010-20404000') AS [Account Number]
        ,('BAAS-ACH CLEARING-INCOMING(FED)') AS [Account Name]
        ,f.fileName AS [File Name]
        ,[Incoming / Outgoing] =  
            CASE f.isOutbound  
            WHEN 1 THEN 'Outgoing'   
            ELSE 'Incoming'  
            END
        ,SUM(CASE WHEN t.transactionCredit > 0 THEN 1 ELSE 0 END) AS [Credit Count]
        ,SUM(b.batchCredits) AS [Credit Amount]
        ,SUM(CASE WHEN t.transactionDebit > 0 THEN 1 ELSE 0 END) AS [Debit Count]
        ,SUM(b.batchDebits) AS [Debit Amount]
    FROM [baas].[fileTransactions] t
    INNER JOIN [baas].[fileBatches] b
        ON t.[batchId] = b.[entityId]
    INNER JOIN [baas].[files] f
        ON b.[fileId] = f.[entityId]
    WHERE f.fromOrganizationId = '${vendor}'
    GROUP BY t.[originationDate], f.fileName, f.isOutbound;`

    let param = {}
    param.params = []
    param.tsql = sqlStatement
    
    try {
        let results = await mssql.executeTSQL(sqlStatement);
        let data = results[0].data

        // add decimal
        let i = -1
        for (const row of data) {
            i++
            let credit = row['Credit Amount']
            credit = credit.toString()
            if(credit.length > 2) {
                data[i]['Credit Amount'] = credit.substring(0,credit.length-2) + '.' + credit.substring(credit.length-2, 3) 
            }

            let debit = row['Debit Amount']
            debit = debit.toString()
            if(debit.length > 2) {
                data[i]['Debit Amount'] = debit.substring(0,debit.length-2) + '.' + debit.substring(debit.length-2, 3) 
            }   
        }

        let csv =  parseCSV(data)
        output.csv = csv

        let date = new Date();
        let fileDate = date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ("0" + date.getHours() ).slice(-2) + ("0" + date.getMinutes()).slice(-2) + ("0" + date.getSeconds()).slice(-2) 

        output.fileName = `${accountNumber}_file_activity_${fileDate}.csv`
        return output
    } catch (err) {
        console.error(err)
        throw err
    }
}

async function accountBalance(VENDOR, SQL, date, accountNumber) {
    let vendor = `synapse`
    let output = {}

    // call SQL and lookup file activity by date and GL account

    // file name
    let f1 = `{account_num}_balance_YYYYMMDDHHMMSS.csv`
    let header = `DATE,ACCOUNT#,ACCOUNT_NAME,BALANCE,CURRENCY`

    // parse results to CSV
    let example = `
    DATE,ACCOUNT#,ACCOUNT_NAME,BALANCE,CURRENCY
    2021/12/3,404404550335,ACH_Clearing,"844,000.42",USD
    2021/12/3,404404550345,Subnet_ACH_Clearing,"3,444,000.02",USD
    2021/12/3,404404550355,Wire_Clearing,"444,000.23",USD
    2021/12/3,404404550365,Subnet_Wire_Clearing,"1,454,060.91",USD
    2021/12/3,404404550375,RDC_Clearing,"4,312.12",USD
    2021/12/3,404404550385,Subnet_RDC_Clearing,"5,667.23",USD
    2021/12/3,404404550395,SWIFT_Clearing,"1,321.00",USD`

    // output the report
    return output
}

function writeCSV(filePath, fileName, csv){
    let file = path.join(filePath, fileName)
    fs.writeFileSync( file, csv, {encoding: 'utf8'} )
    return
}

module.exports.fileActivity = (VENDOR, SQL, date, accountNumber) => {
    return fileActivity(VENDOR, SQL, date, accountNumber)
}

module.exports.accountBalance = (VENDOR, SQL, date, accountNumber) => {
    return accountBalance(VENDOR, SQL, date, accountNumber)
}

module.exports.writeCSV = (filePath, fileName, csv) => {
    return writeCSV(filePath, fileName, csv)
}