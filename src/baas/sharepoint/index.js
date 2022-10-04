"use strict";
/*
    SharePoint Online module
*/

const path = require('path')
var msal = require("@azure/msal-node");
const { promises: fs } = require("fs");
const fss = require('fs');

const { Client } = require("@microsoft/microsoft-graph-client");
require('isomorphic-fetch');

const eol = require('eol')
const os = require('node:os');

const MSAL_CLIENT_ID = process.env.MSAL_SP_CLIENT_ID;
const MSAL_TENANT_ID = process.env.MSAL_SP_TENANT_ID
const MSAL_USERNAME = process.env.MSAL_SP_USERNAME;
const MSAL_PASSWORD = process.env.MSAL_SP_PASSWORD;

let ACCESS_TOKEN

function Handler() {
    /**
     * Cache Plugin configuration
     */
    const cachePath = path.resolve(__dirname + "/data/cache.json");

    const beforeCacheAccess = async (cacheContext) => {
        try {
            const cacheFile = await fs.readFile(cachePath, "utf-8");
            cacheContext.tokenCache.deserialize(cacheFile);
        } catch (error) {
            // if cache file doesn't exists, create it
            cacheContext.tokenCache.deserialize(await fs.writeFile(cachePath, ""));
        }
    };

    const afterCacheAccess = async (cacheContext) => {
        if (cacheContext.cacheHasChanged) {
            try {
                await fs.writeFile(cachePath, cacheContext.tokenCache.serialize());
            } catch (error) {
                if(DEBUG) console.log(error);
                throw ( error )
            }
        }
    };

    const cachePlugin = {
        beforeCacheAccess,
        afterCacheAccess
    };

    const msalConfig = {
        auth: {
            clientId: `${MSAL_CLIENT_ID}`,
            authority: `https://login.microsoftonline.com/${MSAL_TENANT_ID}`,
        },
        cache: {
            cachePlugin
        },
        system: {
            loggerOptions: {
                loggerCallback(loglevel, message, containsPii) {
                    if(DEBUG) console.log(message);
                },
                piiLoggingEnabled: false,
                logLevel: msal.LogLevel.Verbose,
            }
        }
    };

    const pca = new msal.PublicClientApplication(msalConfig);
    const msalTokenCache = pca.getTokenCache();

    async function tokenCalls() {
        let output

        async function getAccounts() {
            return await msalTokenCache.getAllAccounts();
        };

        let accounts = await getAccounts();

        // Acquire Token Silently if an account is present
        if (accounts.length > 0) {
            const silentRequest = {
                account: accounts[0], // Index must match the account that is trying to acquire token silently
                scopes: ["user.read"],
                grant_type: `authorization_code`,
            };

            try {
                let response = await pca.acquireTokenSilent(silentRequest)
                output = response
                if(DEBUG) console.log("\nSuccessful silent token acquisition");
            } catch (err) {
                console.error(err)
                throw( err )
            }
        } else { // fall back to username password if there is no account
            const usernamePasswordRequest = {
                scopes: ["user.read"],
                username: MSAL_USERNAME,
                password: MSAL_PASSWORD,
                grant_type: `authorization_code`,
            };

            try {
                let response = await pca.acquireTokenByUsernamePassword(usernamePasswordRequest)
                if(DEBUG) console.log("acquired token by password grant");
                output = response
            } catch (err) {
                console.error(err)
                throw ( err )
            }
        }

        return output
    }

    function getAuthenticatedClient(accessToken) {
        const client = Client.init({
            authProvider: async (done) => {
                // we have already made the call and got the accessToken above
                // since it was just passed in we will replicate the signature 
                // that microsoft wants and return an authenticated client
    
                // First param to callback is the error,
                // Set to null in success case
                done(null, accessToken);
            }
        })
    
        return client;
    }

    Handler.getClient = async function getClient () {
        if(!ACCESS_TOKEN) {
            let token = await tokenCalls();
            ACCESS_TOKEN = token.accessToken
        }
        
        // console.log(token)
        const client = getAuthenticatedClient( ACCESS_TOKEN )
        return client
    }
    
    Handler.readEmails = async function readEmails({ client, folderId, nextPageLink }) {
        if(!client) throw ('A valid [client] object is required, please call getClient() and pass it into this function.')

        let output = {}
        output.responses = []
        output.emails = []
        
        let email = {} // current email batch being processed

        // does not have a folder specified
        if(!folderId && !nextPageLink){
            if(DEBUG) console.log(`baas.email.readEmails: Fetching the first 10 emails without a folder...`)
            email = await client
            .api('/me/messages')
            .orderby('receivedDateTime desc')
            .top(10)
            .get();
            output.responses.push(email)
            output.emails = output.emails.concat(email.value)
        } 
        
        // has a folder specified
        if(folderId && !nextPageLink){
            if(DEBUG) console.log(`baas.email.readEmails: Fetching the first 10 emails with a folder...`)
            email = await client
            .api(`/me/mailFolders/${folderId}/messages`)
            .orderby('receivedDateTime desc')
            .top(10)
            .get();
            output.responses.push(email)
            output.emails = output.emails.concat(email.value)
        }

        // call the next query that was provided
        if(nextPageLink) {
            if(DEBUG) console.log(`baas.email.readEmails: Fetching the next 10 emails...`)
            email = await client.api( nextPageLink ).get();
            output.responses.push(email)
            output.emails = output.emails.concat(email.value)
        }

        // should we keep going on this n+1 journey?
        if(email.hasOwnProperty('@odata.nextLink')){
            output.nextPageLink = email['@odata.nextLink']
        } else {
            output.nextPageLink = false
        }
    
        output.responses = []
        return output
    }
    
    Handler.createMsGraphAttachments = async function createMsGraphAttachments ( inputFile, existingArray ) {
        if(!inputFile) throw ('inputFile is required to createAttachment for msal-msgraph!')
        let output = existingArray || []
    
        let filename = path.basename(inputFile)
        let base64 = await fs.readFile( inputFile, {encoding: 'base64' });
    
        let attachment = {
            "@odata.type": "#microsoft.graph.fileAttachment",
            "contentBytes": base64,
            "name": filename
        }
    
        output.push( attachment )
    
        return output
    }
    
    return Handler
}

module.exports = Handler;