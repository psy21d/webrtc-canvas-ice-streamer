const INITIALIZING = 0;
const DEVICE = 1;
const TRANSMITTING = 2;
const ERROR = 3;

let state = INITIALIZING;
let errorMessage = '';

/*
 Я, psy21d, честно грыз уебанский код примера для mediamtx, но это единственный работающий код для webrtc стриминга вообще
 За 4 часа мне удалось починить и запустить код примера без интерфейсов, я их все выпилил. 
*/

const url = new URL("http://localhost:8889/live2/publish?video_codec=h264%2F90000&video_bitrate=3000&audio_bitrate=128&audio_voice=false&audio_codec=opus%2F48000&video_width=320&video_height=240");
//const videoBroadcast = document.getElementById("broadcast");

const videoBroadcast = document.getElementById("canvas");

const offscreen = document.createElement('canvas');
offscreen.width = 426;
offscreen.height = 240;

let prop = 1;

let proportionalitica = () => {
    prop = document.body.clientWidth / document.body.clientHeight;
    videoBroadcast.style.scale = (document.body.clientWidth / offscreen.width);
}

window.onresize = proportionalitica;
proportionalitica();

const stream = offscreen.captureStream(12);
const ctx = offscreen.getContext('2d');
const ctxBc = videoBroadcast.getContext("2d");

let magic = 3;
let hidden = 0.7;
let booster = 1;
let max = 0;
let superMax = 1;
let pre = {
    y: 0,
}

let noise = (ctx, ctxBc) => {
    let imax = videoBroadcast.clientHeight / magic;
    let jmax = videoBroadcast.clientWidth / magic;
    // for (let i = 0; i < imax; i++) {
    //     for (let j = 0; j < jmax; j++) {            
    //         ctx.fillStyle = `rgba(
    //             ${Math.floor(Math.random() * 120 - 20.5 * i)},
    //             ${Math.floor(Math.random() * 120 - 20.5 * j)},
    //             0,
    //             ${hidden})`;
    //         ctx.fillRect(j * magic, i * magic, magic, magic);
    //     }
    //     // window.bufferDomain[i] / 128.0;
    // }

    max = 0;

    ctx.fillStyle = `rgba(0, 0, 0, ${hidden})`;
    ctx.fillRect(0, 0, videoBroadcast.clientWidth, videoBroadcast.clientHeight);

    for (let x = 0; x < window.bufferLength; x ++) {
        let num = Math.abs(window.bufferDomain[x]);
        max = Math.max(max, num);
    }

    superMax = superMax * 0.97 + max * 0.03;
    superMax = Math.max(superMax, max);
    
    if (window.bufferDomain) {
        for (let j = 0; j < jmax; j++) {
            let cur = Math.ceil((j / jmax) * window.bufferLength);
            ctx.fillStyle = `rgba(0, ${180 + Math.random() * 220}, 0, ${hidden})`;
            let y = Math.floor((window.bufferDomain[cur] / (superMax * 0.8)) * (imax/2) + imax/2);
            ctx.fillRect(j * magic, y * magic, magic, magic);
            if (pre.y < y) {
                for(let z = pre.y; z < y; z++) {
                    ctx.fillStyle = `rgba(0, ${180 + Math.random() * 220}, 0, ${hidden})`;
                    ctx.fillRect(j * magic, z * magic, magic, magic);
                }
            } else {
                for(let z = y; z < pre.y; z++) {
                    ctx.fillStyle = `rgba(0, ${180 + Math.random() * 220}, 0, ${hidden})`;
                    ctx.fillRect(j * magic, z * magic, magic, magic);
                }
            }
            pre.y = y;
        }
    }

    ctxBc.drawImage(offscreen, 0, 0)
}

let loop = () => {
    noise(ctx, ctxBc);
    setTimeout(() => {
        requestAnimationFrame(loop);
    }, 83)
}

loop()

const restartPause = 2000;

const unquoteCredential = (v) => (
    JSON.parse(`"${v}"`)
);

const linkToIceServers = (links) => (
    (links !== null) ? links.split(', ').map((link) => {
        const m = link.match(/^<(.+?)>; rel="ice-server"(; username="(.*?)"; credential="(.*?)"; credential-type="password")?/i);
        const ret = {
            urls: [m[1]],
        };

        if (m[3] !== undefined) {
            ret.username = unquoteCredential(m[3]);
            ret.credential = unquoteCredential(m[4]);
            ret.credentialType = "password";
        }

        return ret;
    }) : []
);

const parseOffer = (offer) => {
    const ret = {
        iceUfrag: '',
        icePwd: '',
        medias: [],
    };

    for (const line of offer.split('\r\n')) {
        if (line.startsWith('m=')) {
            ret.medias.push(line.slice('m='.length));
        } else if (ret.iceUfrag === '' && line.startsWith('a=ice-ufrag:')) {
            ret.iceUfrag = line.slice('a=ice-ufrag:'.length);
        } else if (ret.icePwd === '' && line.startsWith('a=ice-pwd:')) {
            ret.icePwd = line.slice('a=ice-pwd:'.length);
        }
    }

    return ret;
};

const generateSdpFragment = (offerData, candidates) => {
    const candidatesByMedia = {};
    for (const candidate of candidates) {
        const mid = candidate.sdpMLineIndex;
        if (candidatesByMedia[mid] === undefined) {
            candidatesByMedia[mid] = [];
        }
        candidatesByMedia[mid].push(candidate);
    }

    let frag = 'a=ice-ufrag:' + offerData.iceUfrag + '\r\n'
        + 'a=ice-pwd:' + offerData.icePwd + '\r\n';

    let mid = 0;

    for (const media of offerData.medias) {
        if (candidatesByMedia[mid] !== undefined) {
            frag += 'm=' + media + '\r\n'
                + 'a=mid:' + mid + '\r\n';

            for (const candidate of candidatesByMedia[mid]) {
                frag += 'a=' + candidate.candidate + '\r\n';
            }
        }
        mid++;
    }

    return frag;
};

const setCodec = (section, codec) => {
    const lines = section.split('\r\n');
    const lines2 = [];
    const payloadFormats = [];

    for (const line of lines) {
        if (!line.startsWith('a=rtpmap:')) {
            lines2.push(line);
        } else {
            if (line.toLowerCase().includes(codec)) {
                payloadFormats.push(line.slice('a=rtpmap:'.length).split(' ')[0]);
                lines2.push(line);
            }
        }
    }

    const lines3 = [];

    for (const line of lines2) {
        if (line.startsWith('a=fmtp:')) {
            if (payloadFormats.includes(line.slice('a=fmtp:'.length).split(' ')[0])) {
                lines3.push(line);
            }
        } else if (line.startsWith('a=rtcp-fb:')) {
            if (payloadFormats.includes(line.slice('a=rtcp-fb:'.length).split(' ')[0])) {
                lines3.push(line);
            }
        } else {
            lines3.push(line);
        }
    }

    return lines3.join('\r\n');
};

const setVideoBitrate = (section, bitrate) => {
    let lines = section.split('\r\n');

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('c=')) {
            lines = [...lines.slice(0, i+1), 'b=TIAS:' + (parseInt(bitrate) * 1024).toString(), ...lines.slice(i+1)];
            break
        }
    }

    return lines.join('\r\n');
};

const setAudioBitrate = (section, bitrate, voice) => {
    let opusPayloadFormat = '';
    let lines = section.split('\r\n');

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('a=rtpmap:') && lines[i].toLowerCase().includes('opus/')) {
            opusPayloadFormat = lines[i].slice('a=rtpmap:'.length).split(' ')[0];
            break;
        }
    }

    if (opusPayloadFormat === '') {
        return section;
    }

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('a=fmtp:' + opusPayloadFormat + ' ')) {
            if (voice) {
                lines[i] = 'a=fmtp:' + opusPayloadFormat + ' minptime=10;useinbandfec=1;maxaveragebitrate='
                    + (parseInt(bitrate) * 1024).toString();
            } else {
                lines[i] = 'a=fmtp:' + opusPayloadFormat + ' maxplaybackrate=48000;stereo=1;sprop-stereo=1;maxaveragebitrate'
                    + (parseInt(bitrate) * 1024).toString();
            }
        }
    }

    return lines.join('\r\n');
};

const editAnswer = (answer, videoCodec, audioCodec, videoBitrate, audioBitrate, audioVoice) => {
    const sections = answer.sdp.split('m=');

    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (section.startsWith('video')) {
            sections[i] = setVideoBitrate(setCodec(section, videoCodec), videoBitrate);
        } else if (section.startsWith('audio')) {
            sections[i] = setAudioBitrate(setCodec(section, audioCodec), audioBitrate, audioVoice);
        }
    }

    answer.sdp = sections.join('m=');
};

class Transmitter {
    constructor(stream) {
        this.stream = stream;
        this.pc = null;
        this.restartTimeout = null;
        this.sessionUrl = '';
        this.queuedCandidates = [];
        this.start();
    }

    start() {
        console.log("requesting ICE servers");

        fetch(new URL('whip', url) + url.search, {
            method: 'OPTIONS',
        })
            .then((res) => this.onIceServers(res))
            .catch((err) => {
                console.log('error: ' + err);
                this.scheduleRestart();
            });
    }

    onIceServers(res) {
        console.log(res.headers.get('Link'));
        
        this.pc = new RTCPeerConnection({
            iceServers: linkToIceServers(res.headers.get('Link')),
        });


        this.pc.onicecandidate = (evt) => this.onLocalCandidate(evt);
        this.pc.oniceconnectionstatechange = () => this.onConnectionState();

        this.stream.getTracks().forEach((track) => {
            this.pc.addTrack(track, this.stream);
        });

        this.pc.createOffer()
            .then((offer) => this.onLocalOffer(offer));
    }

    onLocalOffer(offer) {
        this.offerData = parseOffer(offer.sdp);
        this.pc.setLocalDescription(offer);

        console.log("sending offer");

        let fUrl = new URL('whip', url) + url.search
        
        fetch(fUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sdp',
            },
            body: offer.sdp,
        })
            .then((res) => {
                if (res.status !== 201) {
                    throw new Error('bad status code');
                }
                this.sessionUrl = new URL(res.headers.get('location'), url.href).toString();
                return res.text();
            })
            .then((sdp) => this.onRemoteAnswer(new RTCSessionDescription({
                type: 'answer',
                sdp,
            })))
            .catch((err) => {
                console.log('error: ' + err);
                this.scheduleRestart();
            });
    }

    onConnectionState() {
        if (this.restartTimeout !== null) {
            return;
        }

        console.log("peer connection state:", this.pc.iceConnectionState);

        switch (this.pc.iceConnectionState) {
        case "disconnected":
            this.scheduleRestart();
        }
    }

    onRemoteAnswer(answer) {
        if (this.restartTimeout !== null) {
            return;
        }
        editAnswer(
            answer,
            "h264",    //     videoForm.codec.value,
            "opus",    //     audioForm.codec.value,
            "160",    //     videoForm.bitrate.value,
            "32",   //     audioForm.bitrate.value,
            false    //     audioForm.voice.checked,
        );

        this.pc.setRemoteDescription(answer);

        if (this.queuedCandidates.length !== 0) {
            this.sendLocalCandidates(this.queuedCandidates);
            this.queuedCandidates = [];
        }
    }

    onLocalCandidate(evt) {
        if (this.restartTimeout !== null) {
            return;
        }

        if (evt.candidate !== null) {
            if (this.sessionUrl === '') {
                this.queuedCandidates.push(evt.candidate);
            } else {
                this.sendLocalCandidates([evt.candidate])
            }
        }
    }

    sendLocalCandidates(candidates) {
        fetch(this.sessionUrl + window.location.search, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/trickle-ice-sdpfrag',
                'If-Match': '*',
            },
            body: generateSdpFragment(this.offerData, candidates),
        })
            .then((res) => {
                if (res.status !== 204) {
                    throw new Error('bad status code');
                }
            })
            .catch((err) => {
                console.log('error: ' + err);
                this.scheduleRestart();
            });
    }

    scheduleRestart() {
        if (this.restartTimeout !== null) {
            return;
        }

        if (this.pc !== null) {
            this.pc.close();
            this.pc = null;
        }

        this.restartTimeout = window.setTimeout(() => {
            this.restartTimeout = null;
            this.start();
        }, restartPause);

        if (this.sessionUrl) {
            fetch(this.sessionUrl, {
                method: 'DELETE',
            })
                .then((res) => {
                    if (res.status !== 200) {
                        throw new Error('bad status code');
                    }
                })
                .catch((err) => {
                    console.log('delete session error: ' + err);
                });
        }
        this.sessionUrl = '';

        this.queuedCandidates = [];
    }
}

const onTransmit = (stream) => {
    //videoBroadcast.srcObject = stream;
    new Transmitter(stream);
};

const onPublish = () => {
    state = TRANSMITTING;

    // const videoId = videoForm.device.value;
    // const audioId = audioForm.device.value;

    // if (videoId !== 'screen') {
    //     let video = false;
    //     if (videoId !== 'none') {
    //         video = {
    //             deviceId: videoId,
    //         };
    //     }

    //     let audio = false;

    //     if (audioId !== 'none') {
    //         audio = {
    //             deviceId: audioId,
    //         };

    //         const voice = audioForm.voice.checked;
    //         if (!voice) {
    //             audio.autoGainControl = false;
    //             audio.echoCancellation = false;
    //             audio.noiseSuppression = false;
    //         }
    //     }

        // const constraints = {
        //     video: { facingMode: "user" },
        //     // Uncomment to enable audio
        //     // audio: true
        //   };

        // navigator.mediaDevices.getUserMedia(constraints)
        //     .then(stream => {
        //         onTransmit(stream);
        //     })
        //     .catch((err) => {
        //         state = ERROR;
        //         errorMessage = err.toString();
        //     });

        onTransmit(stream);

    // } else {
    //     navigator.mediaDevices.getDisplayMedia({
    //         video: {
    //             width: { ideal: videoForm.width.value },
    //             height: { ideal: videoForm.height.value },
    //             frameRate: { ideal: videoForm.framerate.value },
    //             cursor: "always",
    //         },
    //         audio: true,
    //     })
    //         .then(stream => {
    //             onTransmit(stream);
    //         })
    //         .catch((err) => {
    //             state = ERROR;
    //             errorMessage = err.toString();
    //         });
    // }
};

// const populateDevices = () => {
//     return navigator.mediaDevices.enumerateDevices()
//         .then((devices) => {
//             for (const device of devices) {
//                 switch (device.kind) {
//                 case 'videoinput':
//                     {
//                         const opt = document.createElement('option');
//                         opt.value = device.deviceId;
//                         opt.text = device.label;
//                         videoForm.device.appendChild(opt);
//                     }
//                     break;

//                 case 'audioinput':
//                     {
//                         const opt = document.createElement('option');
//                         opt.value = device.deviceId;
//                         opt.text = device.label;
//                         audioForm.device.appendChild(opt);
//                     }
//                     break;
//                 }
//             }

//             if (navigator.mediaDevices.getDisplayMedia !== undefined) {
//                 const opt = document.createElement('option');
//                 opt.value = "screen";
//                 opt.text = "screen";
//                 videoForm.device.appendChild(opt);
//             }

//             if (videoForm.device.children.length !== 0) {
//                 videoForm.device.value = videoForm.device.children[1].value;
//             }

//             if (audioForm.device.children.length !== 0) {
//                 audioForm.device.value = audioForm.device.children[1].value;
//             }
//         });
//     };

// const populateCodecs = () => {
//     const pc = new RTCPeerConnection({});
//     pc.addTransceiver("video", { direction: 'sendonly' });
//     pc.addTransceiver("audio", { direction: 'sendonly' });

//     return pc.createOffer()
//         .then((desc) => {
//             const sdp = desc.sdp.toLowerCase();

//             for (const codec of ['av1/90000', 'vp9/90000', 'vp8/90000', 'h264/90000']) {
//                 if (sdp.includes(codec)) {
//                     const opt = document.createElement('option');
//                     opt.value = codec;
//                     opt.text = codec.split('/')[0].toUpperCase();
//                     videoForm.codec.appendChild(opt);
//                 }
//             }

//             for (const codec of ['opus/48000', 'g722/8000', 'pcmu/8000', 'pcma/8000']) {
//                 if (sdp.includes(codec)) {
//                     const opt = document.createElement('option');
//                     opt.value = codec;
//                     opt.text = codec.split('/')[0].toUpperCase();
//                     audioForm.codec.appendChild(opt);
//                 }
//             }

//             pc.close();
//         });
// };

const initialize = () => {
    // if (navigator.mediaDevices === undefined) {
    //     state = ERROR;
    //     errorMessage = 'can\'t access webcams or microphones. Make sure that WebRTC encryption is enabled.';
    //     return;
    // }

    // navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    //     .then(() => Promise.all([
    //         populateDevices(),
    //         populateCodecs(),
    //     ]))
    //     .then(() => {
    //         state = DEVICE;
    //     })
    //     .catch((err) => {
    //         state = ERROR;
    //         errorMessage = err.toString();
    //     });
};

initialize();
onPublish();