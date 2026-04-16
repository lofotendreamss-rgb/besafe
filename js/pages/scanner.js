// DEPRECATED: This stub page is no longer used.
// Functionality moved to: js/ui/receipt-scanner.js (openReceiptScanner)
//
// scanner.js
// BeSafe Barcode Scanner Page

export function initPage(){

const container = document.getElementById("scanner-container");

if(!container){
console.warn("Scanner container not found");
return;
}

container.innerHTML = `
<div class="page-card">
<h3>📷 Barcode Scanner</h3>

<div id="scanner-view" style="width:100%;height:300px;background:#000"></div>

<button id="start-scan">Start Scan</button>
<button id="stop-scan">Stop Scan</button>

<p id="scan-result" style="margin-top:10px;"></p>

</div>
`;

const startBtn = document.getElementById("start-scan");
const stopBtn = document.getElementById("stop-scan");

if(startBtn){
startBtn.addEventListener("click", startScanner);
}

if(stopBtn){
stopBtn.addEventListener("click", stopScanner);
}

}

/* START SCANNER */

function startScanner(){

const resultBox = document.getElementById("scan-result");

Quagga.init({

inputStream : {
name : "Live",
type : "LiveStream",
target: document.querySelector("#scanner-view")
},

decoder : {
readers : ["ean_reader","ean_8_reader","code_128_reader"]
}

}, function(err) {

if (err) {
console.error(err);
return;
}

Quagga.start();

});

Quagga.onDetected(function(data){

const code = data.codeResult.code;

if(resultBox){
resultBox.innerHTML = "Scanned code: " + code;
}

});

}

/* STOP SCANNER */

function stopScanner(){

try{
Quagga.stop();
}catch(err){
console.warn("Scanner not running");
}

}