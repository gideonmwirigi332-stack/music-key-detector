let audioContext;
let analyser;
let source;
let microphoneStream;

let animationFrame;

const noteNames = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B"
];

const frequencies = {
  "C": 261.63,
  "C#": 277.18,
  "D": 293.66,
  "D#": 311.13,
  "E": 329.63,
  "F": 349.23,
  "F#": 369.99,
  "G": 392.00,
  "G#": 415.30,
  "A": 440.00,
  "A#": 466.16,
  "B": 493.88
};

const noteHistory = [];

const keyDisplay =
  document.getElementById("keyDisplay");

const confidenceDisplay =
  document.getElementById("confidence");

const noteDisplay =
  document.getElementById("note");

const frequencyDisplay =
  document.getElementById("frequency");

const noteCountDisplay =
  document.getElementById("noteCount");

const statusDisplay =
  document.getElementById("status");

const micBtn =
  document.getElementById("micBtn");

const stopBtn =
  document.getElementById("stopBtn");

const audioFile =
  document.getElementById("audioFile");

const canvas =
  document.getElementById("visualizer");

const canvasContext =
  canvas.getContext("2d");

const meterFill =
  document.getElementById("meterFill");


/* ---------------------------
   Start microphone
---------------------------- */

micBtn.addEventListener("click", async () => {

  try {

    microphoneStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

    startAudio();

    source =
      audioContext.createMediaStreamSource(
        microphoneStream
      );

    source.connect(analyser);

    statusDisplay.textContent =
      "Listening to microphone...";

    micBtn.disabled = true;
    stopBtn.disabled = false;

  } catch (error) {

    console.error(error);

    statusDisplay.textContent =
      "Microphone permission was denied.";

  }

});


/* ---------------------------
   Upload audio
---------------------------- */

audioFile.addEventListener("change", async event => {

  const file =
    event.target.files[0];

  if (!file) return;

  stopAudio();

  startAudio();

  const arrayBuffer =
    await file.arrayBuffer();

  const audioBuffer =
    await audioContext.decodeAudioData(
      arrayBuffer
    );

  source =
    audioContext.createBufferSource();

  source.buffer = audioBuffer;

  source.connect(analyser);

  analyser.connect(
    audioContext.destination
  );

  source.start();

  statusDisplay.textContent =
    "Analyzing: " + file.name;

  stopBtn.disabled = false;

});


/* ---------------------------
   Initialize audio
---------------------------- */

function startAudio() {

  audioContext =
    new (
      window.AudioContext ||
      window.webkitAudioContext
    )();

  analyser =
    audioContext.createAnalyser();

  analyser.fftSize = 4096;

  analyser.smoothingTimeConstant = 0.8;

  noteHistory.length = 0;

  detect();

}


/* ---------------------------
   Stop
---------------------------- */

stopBtn.addEventListener("click", () => {

  stopAudio();

  statusDisplay.textContent =
    "Stopped.";

});


function stopAudio() {

  cancelAnimationFrame(animationFrame);

  if (microphoneStream) {

    microphoneStream
      .getTracks()
      .forEach(track => track.stop());

    microphoneStream = null;
  }

  if (source) {

    try {
      source.stop();
    } catch (e) {}

    source = null;
  }

  if (audioContext) {

    audioContext.close();

    audioContext = null;
  }

  micBtn.disabled = false;
  stopBtn.disabled = true;

}


/* ---------------------------
   Main detector
---------------------------- */

function detect() {

  if (!analyser) return;

  const buffer =
    new Float32Array(
      analyser.fftSize
    );

  analyser.getFloatTimeDomainData(
    buffer
  );

  drawWaveform(buffer);

  const volume =
    calculateRMS(buffer);

  meterFill.style.width =
    Math.min(volume * 600, 100) + "%";


  if (volume > 0.01) {

    const frequency =
      detectPitch(
        buffer,
        audioContext.sampleRate
      );

    if (frequency > 0) {

      const midi =
        Math.round(
          69 +
          12 *
          Math.log2(frequency / 440)
        );

      const noteIndex =
        ((midi % 12) + 12) % 12;

      const note =
        noteNames[noteIndex];

      noteDisplay.textContent =
        note;

      frequencyDisplay.textContent =
        frequency.toFixed(2) + " Hz";

      highlightNote(note);

      noteHistory.push(noteIndex);

      if (noteHistory.length > 300) {
        noteHistory.shift();
      }

      noteCountDisplay.textContent =
        noteHistory.length;

      if (noteHistory.length > 15) {

        const result =
          detectKey(noteHistory);

        keyDisplay.textContent =
          result.key;

        confidenceDisplay.textContent =
          "Confidence: " +
          result.confidence +
          "%";
      }

    }

  }

  animationFrame =
    requestAnimationFrame(detect);

}


/* ---------------------------
   RMS
---------------------------- */

function calculateRMS(buffer) {

  let sum = 0;

  for (let i = 0; i < buffer.length; i++) {

    sum += buffer[i] * buffer[i];

  }

  return Math.sqrt(
    sum / buffer.length
  );

}


/* ---------------------------
   Pitch detection
---------------------------- */

function detectPitch(
  buffer,
  sampleRate
) {

  const SIZE =
    buffer.length;

  let rms = 0;

  for (let i = 0; i < SIZE; i++) {

    rms +=
      buffer[i] *
      buffer[i];

  }

  rms =
    Math.sqrt(
      rms / SIZE
    );

  if (rms < 0.01) {
    return -1;
  }

  let bestOffset = -1;
  let bestCorrelation = 0;

  for (
    let offset = 20;
    offset < SIZE / 2;
    offset++
  ) {

    let correlation = 0;

    for (
      let i = 0;
      i < SIZE - offset;
      i++
    ) {

      correlation +=
        buffer[i] *
        buffer[i + offset];

    }

    if (
      correlation >
      bestCorrelation
    ) {

      bestCorrelation =
        correlation;

      bestOffset =
        offset;

    }

  }

  if (bestOffset === -1) {
    return -1;
  }

  const frequency =
    sampleRate / bestOffset;

  if (
    frequency < 60 ||
    frequency > 1200
  ) {

    return -1;

  }

  return frequency;

}


/* ---------------------------
   Key detection
---------------------------- */

/*
  Major and minor key profiles.
  These are simplified Krumhansl-style
  profiles used to compare the notes
  detected from the audio.
*/

const majorProfile = [
  6.35,
  2.23,
  3.48,
  2.33,
  4.38,
  4.09,
  2.52,
  5.19,
  2.39,
  3.66,
  2.29,
  2.88
];

const minorProfile = [
  6.33,
  2.68,
  3.52,
  5.38,
  2.60,
  3.53,
  2.54,
  4.75,
  3.98,
  2.69,
  3.34,
  3.17
];


function detectKey(notes) {

  const histogram =
    new Array(12).fill(0);

  notes.forEach(note => {
    histogram[note]++;
  });

  let bestKey =
    "C Major";

  let bestScore =
    -Infinity;

  let secondScore =
    -Infinity;


  for (
    let root = 0;
    root < 12;
    root++
  ) {

    const majorScore =
      correlation(
        histogram,
        rotate(
          majorProfile,
          root
        )
      );

    const minorScore =
      correlation(
        histogram,
        rotate(
          minorProfile,
          root
        )
      );

    if (
      majorScore >
      bestScore
    ) {

      secondScore =
        bestScore;

      bestScore =
        majorScore;

      bestKey =
        noteNames[root] +
        " Major";

    }

    if (
      minorScore >
      bestScore
    ) {

      secondScore =
        bestScore;

      bestScore =
        minorScore;

      bestKey =
        noteNames[root] +
        " Minor";

    }

  }

  const confidence =
    calculateConfidence(
      bestScore,
      secondScore
    );

  return {
    key: bestKey,
    confidence
  };

}


/* ---------------------------
   Rotate profile
---------------------------- */

function rotate(
  array,
  root
) {

  const result =
    new Array(12);

  for (
    let i = 0;
    i < 12;
    i++
  ) {

    result[i] =
      array[
        (i - root + 12) % 12
      ];

  }

  return result;

}


/* ---------------------------
   Correlation
---------------------------- */

function correlation(
  a,
  b
) {

  let sumA = 0;
  let sumB = 0;

  let sumAB = 0;
  let sumA2 = 0;
  let sumB2 = 0;

  for (
    let i = 0;
    i < 12;
    i++
  ) {

    sumA += a[i];
    sumB += b[i];

    sumAB +=
      a[i] * b[i];

    sumA2 +=
      a[i] * a[i];

    sumB2 +=
      b[i] * b[i];

  }

  const numerator =
    12 * sumAB -
    sumA * sumB;

  const denominator =
    Math.sqrt(
      (12 * sumA2 - sumA * sumA) *
      (12 * sumB2 - sumB * sumB)
    );

  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;

}


/* ---------------------------
   Confidence
---------------------------- */

function calculateConfidence(
  best,
  second
) {

  if (
    !isFinite(second)
  ) {

    return 50;

  }

  let difference =
    best - second;

  let confidence =
    50 + difference * 100;

  confidence =
    Math.max(
      1,
      Math.min(
        99,
        confidence
      )
    );

  return Math.round(
    confidence
  );

}


/* ---------------------------
   Highlight piano
---------------------------- */

function highlightNote(note) {

  document
    .querySelectorAll(".white, .black")
    .forEach(key => {

      key.classList.remove(
        "active"
      );

    });

  const key =
    document.querySelector(
      `[data-note="${note}"]`
    );

  if (key) {
    key.classList.add("active");
  }

}


/* ---------------------------
   Waveform
---------------------------- */

function drawWaveform(buffer) {

  const width =
    canvas.width =
      canvas.clientWidth;

  const height =
    canvas.height =
      canvas.clientHeight;

  canvasContext.clearRect(
    0,
    0,
    width,
    height
  );

  canvasContext.beginPath();

  for (
    let i = 0;
    i < buffer.length;
    i++
  ) {

    const x =
      i / buffer.length * width;

    const y =
      (0.5 +
      buffer[i] * 0.4) *
      height;

    if (i === 0) {

      canvasContext.moveTo(
        x,
        y
      );

    } else {

      canvasContext.lineTo(
        x,
        y
      );

    }

  }

  canvasContext.strokeStyle =
    "#4f7cff";

  canvasContext.lineWidth = 2;

  canvasContext.stroke();

}
