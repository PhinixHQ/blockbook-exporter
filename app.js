const axios = require('axios');
const express = require('express');
const app = express();
require('dotenv').config();
const client = require('prom-client');
const https = require('https'); 
axios.defaults.timeout = parseInt(process.env.AXIOS_TIMEOUT);
const Sentry = require('@sentry/node');

// Sentry
Sentry.init({ dsn: process.env.SENTRY_DSN });
Sentry.configureScope(scope => {
    scope.setTag('coin', process.env.COIN_NAME);
    scope.setTag('scope', process.env.SCOPE);
  });
// URLs
const blockbookGlobalScanApiUrl = process.env.BLOCKBOOK_GLOBAL_SCAN_BASE_URL
const blockbookHostedApiUrl = process.env.BLOCKBOOK_HOSTED_BASE_URL


const blockbookGlobalScanUpGauge = new client.Gauge({ name: 'blockbook_global_up', help: 'if blockbook_global is accessible', labelNames: ['coin']});
const blockbookGlobalCurrentBlockGauge = new client.Gauge({ name: 'blockbook_global_current_block', help: 'number of current block', labelNames: ['coin'] });
const blockbookGlobalLastUpdateGauge = new client.Gauge({ name: 'blockbook_global_last_update_seconds', help: 'last time the exporter updated data from the global blockbook', labelNames: ['coin'] });

const blockbookHostedUpGauge = new client.Gauge({ name: 'blockbook_hosted_up', help: 'if blockbook hosted is accessible', labelNames: ['coin'] });
const blockbookHostedCurrentBlockGauge = new client.Gauge({ name: 'blockbook_hosted_current_block', help: 'number of current block' , labelNames: ['coin']});
const blockbookHostedIssyncedGauge = new client.Gauge({ name: 'blockbook_hosted_in_sync', help: 'whether blockbook synced with backend or not' , labelNames: ['coin']});
const blockbookHostedLastUpdateGauge = new client.Gauge({ name: 'blockbook_hosted_last_update_seconds', help: 'last time the exporter updated data from the local blockbook', labelNames: ['coin'] });



async function updateBlockbookglobalMetrics(){
    try{
        console.log('starting blockbookGlobalLatestBlock');
        const blockbookGlobalLatestBlock = await axios.get(blockbookGlobalScanApiUrl, {headers: {'user-agent':'phinix'}});
        console.log('done blockbookGlobalLatestBlock');
        console.log('///////////////////////////////');
        const coinName = blockbookGlobalLatestBlock.data.blockbook.coin;
        blockbookGlobalScanUpGauge.set({ coin: coinName } , 1);
        blockbookGlobalCurrentBlockGauge.set({ coin: coinName } ,blockbookGlobalLatestBlock.data.blockbook.bestHeight);
        blockbookGlobalLastUpdateGauge.set({ coin: coinName } ,Math.floor(Date.now() / 1000));
    }
    catch(err) {
        Sentry.captureException(err);
        console.log(err);
        console.log('error on blockbookGlobalLatestBlock');
        blockbookGlobalScanUpGauge.set({ coin: process.env.COIN_NAME }, 0);
    }
}


async function updateBlockbookHostedMetrics(){
    try{
        const agent = new https.Agent({  
            rejectUnauthorized: false
          });
        console.log('starting blockbookHostedLatestBlock');
        const blockbookHostedLatestBlock = await axios.get(blockbookHostedApiUrl, {httpsAgent: new https.Agent({ rejectUnauthorized: false })});
        console.log('done blockbookHostedLatestBlock');
        console.log('///////////////////////////////');
        const coinName = blockbookHostedLatestBlock.data.blockbook.coin;
        blockbookHostedUpGauge.set({ coin: coinName } ,1);
        blockbookHostedCurrentBlockGauge.set({ coin: coinName } ,blockbookHostedLatestBlock.data.blockbook.bestHeight);
        
        if (blockbookHostedLatestBlock.data.blockbook.inSync == true)
        {
            blockbookHostedIssyncedGauge.set({ coin: coinName } ,1);
        }else{
            blockbookHostedIssyncedGauge.set({ coin: coinName } ,0);
        }


        blockbookHostedLastUpdateGauge.set({ coin: coinName } ,Math.floor(Date.now() / 1000));
    }
    catch(err){
        Sentry.captureException(err);
        console.log(err);
        console.log('error blockbookHostedLatestBlock');
        blockbookHostedUpGauge.set({ coin: process.env.COIN_NAME } ,0);
    }
}




// metrics endpoint for prometheus
app.get('/metrics', async (req, res) => {
    metrics = await client.register.metrics();
    return res.status(200).send(metrics);
});

app.listen(process.env.LISTEN_PORT, () => console.log('Server is running and metrics are exposed on http://URL:3000/metrics'));

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(){
   while(true){
       await Promise.all([updateBlockbookglobalMetrics(), updateBlockbookHostedMetrics(), delay(process.env.REFRESH_INTERVAL_MILLISECONDS)]);
   }
}

main();

