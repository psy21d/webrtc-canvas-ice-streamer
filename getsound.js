// Each MediaDevicesInfo contains a property named kind with the value 
// audioinput, audiooutput or videoinput, indicating what type of media device it is.
let sounds = null;
let thisStream = null;
window.bufferDomain = null;

getConnectedDevices('audioinput', devices => {
    sounds = devices;
    console.log('Sounds found', sounds);
    getDevice(devices);
});

// const constraints = {
//     'video': true,
//     'audio': true
// }

function getDevice(devices) {
    const constraints = {
        'audio': {
            'deviceId': devices[0].deviceId
        },
        'video': false
    }

    navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
        console.log('Got MediaStream:', stream);
        thisStream = stream;
        makeAnalyser();
    })
    .catch(error => {
        console.error('Error accessing media devices.', error);
    });
}

function getConnectedDevices(type, callback) {
    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            const filtered = devices.filter(device => device.kind === type);
            callback(filtered);
        });
}

function makeAnalyser() {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(thisStream);
    const analyser = audioCtx.createAnalyser();
    source.connect(analyser);
    
    // analyser.connect(distortion);
    // distortion.connect(audioCtx.destination);

    analyser.fftSize = 2048 * 4;
    window.bufferLength = analyser.frequencyBinCount;
    window.bufferDomain = new Float32Array(window.bufferLength);

    // draw an oscilloscope of the current audio source

function draw() {
    drawVisual = requestAnimationFrame(draw);

    analyser.getFloatTimeDomainData(window.bufferDomain);

    // dataArray[i] / 128.0;
}

draw();

}