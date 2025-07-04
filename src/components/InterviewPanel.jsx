// src/components/InterviewPanel.jsx
import React, { useState, useRef, useEffect } from "react";
import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import * as tf from "@tensorflow/tfjs";
import questionsData from "../questions.json";
import "../index.css";

const InterviewPanel = () => {
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [techStack, setTechStack] = useState("");
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recordingState, setRecordingState] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [answers, setAnswers] = useState([]);
  const [isStackLocked, setIsStackLocked] = useState(false);
  const [gazeOff, setGazeOff] = useState(false);

  const videoRef = useRef(null);
  const recognitionRef = useRef(null);

  // ✅ Setup camera and FaceMesh
  useEffect(() => {
    let model;
    const setupCameraAndModel = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await new Promise((resolve) => (videoRef.current.onloadedmetadata = resolve));
        }

        await tf.setBackend("webgl");
        await tf.ready();

        model = await faceLandmarksDetection.load(
          faceLandmarksDetection.SupportedPackages.mediapipeFacemesh
        );
        detectGaze(model);
      } catch (err) {
        console.error("Camera/model error:", err);
      }
    };

    setupCameraAndModel();

    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // ✅ Gaze detection
const detectGaze = async (model) => {
  const detect = async () => {
    if (videoRef.current?.readyState === 4) {
      const predictions = await model.estimateFaces({ input: videoRef.current });

      if (predictions.length > 0 && predictions[0].keypoints?.length > 386) {
        const keypoints = predictions[0].keypoints;

        const leftEye = keypoints[159];
        const rightEye = keypoints[386];

        const eyeDelta = Math.abs(leftEye.x - rightEye.x);

        if (eyeDelta < 40) {
          setGazeOff(true); // might be looking away
        } else {
          setGazeOff(false); // looking at screen
        }
      } else {
        // Handle face not detected
        setGazeOff(true);
      }
    }

    requestAnimationFrame(detect);
  };

  detect();
};

  // ✅ Handle tech stack change
  const handleTechStack = (e) => {
    const selected = e.target.value;
    setTechStack(selected);
    const filtered = questionsData.filter((q) => q.techStack === selected);
    const randomFive = filtered.sort(() => 0.5 - Math.random()).slice(0, 5);
    setQuestions(randomFive);
    setCurrentIndex(0);
    setTranscript("");
    setAnswers([]);
    setRecordingState("idle");
    setIsStackLocked(true);
  };

  // ✅ Start speech recording
  const startRecording = () => {
    if (!("webkitSpeechRecognition" in window)) {
      alert("Speech recognition not supported.");
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const result = event.results[0][0].transcript;
      setTranscript(result);
      setRecordingState("finished");
    };

    recognition.onerror = () => setRecordingState("idle");

    recognitionRef.current = recognition;
    setTranscript("");
    setRecordingState("recording");
    recognition.start();
  };

  const stopRecording = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setRecordingState("finished");
  };

  const restartRecording = () => {
    if (recognitionRef.current) recognitionRef.current.abort();
    setTranscript("");
    setRecordingState("idle");
    setTimeout(() => startRecording(), 300);
  };

  const handleNext = () => {
    if (transcript.trim() !== "") {
      setAnswers((prev) => [
        ...prev,
        { question: questions[currentIndex].question, userAnswer: transcript },
      ]);
    }

    setTranscript("");
    setRecordingState("idle");

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      sendAnswersToBackend();
    }
  };

  const sendAnswersToBackend = async () => {
    try {
      const res = await fetch("http://localhost:5000/save-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ techStack, answers }),
      });
      alert(res.ok ? "Answers submitted!" : "Failed to submit.");
    } catch (err) {
      console.error(err);
      alert("Server error");
    }
  };

  return (
    <div className="panel-container">
      {/* ✅ Webcam */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="video-feed"
        style={{ border: gazeOff ? "4px solid red" : "4px solid #2196F3" }}
      />

      {!interviewStarted ? (
        <div className="start-screen">
          <h1 className="start-title">Welcome to the AI Interview Panel</h1>
          <button onClick={() => setInterviewStarted(true)} className="start-button">
            🚀 Start Interview
          </button>
        </div>
      ) : (
        <>
          <label className="panel-label">
            Select Tech Stack:
            <select
              className="panel-select"
              onChange={handleTechStack}
              value={techStack}
              disabled={isStackLocked}
            >
              <option value="">-- Select --</option>
              <option value="React">React</option>
              <option value="Node.js">Node.js</option>
            </select>
          </label>

          {questions.length > 0 && (
            <div className="question-box">
              <div className="progress-bar">
                <div
                  className="progress"
                  style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                ></div>
              </div>

              <div className="question-card">
                <p className="question-progress">
                  Question {currentIndex + 1} of {questions.length}
                </p>
                <p className="question-text">{questions[currentIndex].question}</p>

                {recordingState === "idle" && (
                  <button onClick={startRecording} className="panel-button">
                    🎤 Start Recording
                  </button>
                )}

                {recordingState === "recording" && (
                  <>
                    <p className="recording-status">Recording... 🎙️</p>
                    <button onClick={stopRecording} className="panel-button warning">
                      ✅ Finish Recording
                    </button>
                    <button onClick={restartRecording} className="panel-button restart">
                      🔁 Restart Recording
                    </button>
                  </>
                )}

                {recordingState === "finished" && transcript && (
                  <>
                    <p className="answer-preview">
                      <strong>Your Answer:</strong> {transcript}
                    </p>
                    <button onClick={restartRecording} className="panel-button restart">
                      🔁 Restart Recording
                    </button>
                    <button
                      onClick={handleNext}
                      className="panel-button next"
                      disabled={transcript.trim() === ""}
                    >
                      {currentIndex < questions.length - 1 ? "Next" : "Submit Answers"}
                    </button>
                  </>
                )}

                {gazeOff && (
                  <p className="warning-text">⚠️ Please focus on the screen.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default InterviewPanel;
