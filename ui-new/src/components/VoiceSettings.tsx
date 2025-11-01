import React, { useState, useEffect } from 'react';
import { Mic, Volume2, Clock, Settings as SettingsIcon } from 'lucide-react';

export const VoiceSettings: React.FC = () => {
  // Available hotwords for continuous voice mode
  const availableHotwords = [
    { value: 'hey google', label: 'Hey Google' },
    { value: 'ok google', label: 'OK Google' },
    { value: 'alexa', label: 'Alexa' },
    { value: 'hey siri', label: 'Hey Siri' },
    { value: 'computer', label: 'Computer' },
    { value: 'jarvis', label: 'Jarvis' },
  ];

  // Load settings from localStorage
  const [hotword, setHotword] = useState(() => {
    return localStorage.getItem('continuousVoice_hotword') || 'hey google';
  });

  const [sensitivity, setSensitivity] = useState(() => {
    return parseFloat(localStorage.getItem('continuousVoice_sensitivity') || '0.5');
  });

  const [timeoutDuration, setTimeoutDuration] = useState(() => {
    return parseInt(localStorage.getItem('continuousVoice_timeout') || '10000');
  });

  const [useLocalWhisper, setUseLocalWhisper] = useState(() => {
    return localStorage.getItem('voice_useLocalWhisper') === 'true';
  });

  const [localWhisperUrl, setLocalWhisperUrl] = useState(() => {
    return localStorage.getItem('voice_localWhisperUrl') || 'http://localhost:8000';
  });

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('continuousVoice_hotword', hotword);
  }, [hotword]);

  useEffect(() => {
    localStorage.setItem('continuousVoice_sensitivity', sensitivity.toString());
  }, [sensitivity]);

  useEffect(() => {
    localStorage.setItem('continuousVoice_timeout', timeoutDuration.toString());
  }, [timeoutDuration]);

  useEffect(() => {
    localStorage.setItem('voice_useLocalWhisper', useLocalWhisper.toString());
  }, [useLocalWhisper]);

  useEffect(() => {
    localStorage.setItem('voice_localWhisperUrl', localWhisperUrl);
  }, [localWhisperUrl]);

  const handleSensitivityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSensitivity(parseFloat(e.target.value));
  };

  const handleTimeoutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTimeoutDuration(parseInt(e.target.value));
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Continuous Voice Mode Settings */}
      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Mic className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Continuous Voice Mode
          </h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Configure voice activation settings for hands-free conversation. Say the hotword to activate voice input,
          then speak your question. The system will respond and automatically return to listening for the hotword.
        </p>

        {/* Hotword Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Volume2 className="w-4 h-4 inline mr-2" />
            Hotword / Wake Word
          </label>
          <select
            value={hotword}
            onChange={(e) => setHotword(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {availableHotwords.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Say this phrase to activate voice input. Current: <strong>"{hotword}"</strong>
          </p>
        </div>

        {/* Hotword Sensitivity */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <SettingsIcon className="w-4 h-4 inline mr-2" />
            Hotword Sensitivity
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={sensitivity}
              onChange={handleSensitivityChange}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">
              {(sensitivity * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>Less sensitive (fewer false positives)</span>
            <span>More sensitive (easier activation)</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Adjust how easily the hotword triggers. Higher values activate more easily but may cause false positives.
          </p>
        </div>

        {/* Silence Timeout */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Clock className="w-4 h-4 inline mr-2" />
            Silence Timeout
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="3000"
              max="30000"
              step="1000"
              value={timeoutDuration}
              onChange={handleTimeoutChange}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <span className="text-sm font-medium text-gray-900 dark:text-white w-16 text-right">
              {(timeoutDuration / 1000).toFixed(0)}s
            </span>
          </div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>3 seconds</span>
            <span>30 seconds</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            How long to wait for speech before automatically returning to hotword listening mode. 
            After AI responds, this timeout determines how long you have to continue the conversation.
          </p>
        </div>
      </section>

      {/* Speech Recognition Settings */}
      <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Mic className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Speech Recognition (STT)
          </h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Configure speech-to-text settings. When running locally, the system can use a local Whisper service 
          for faster, privacy-first transcription before falling back to configured cloud providers.
        </p>

        {/* Local Whisper Option */}
        <div className="mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useLocalWhisper}
              onChange={(e) => setUseLocalWhisper(e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                🏠 Try Local Whisper First
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                When running Lambda locally, attempt to use local Whisper service before cloud providers
              </div>
            </div>
          </label>
        </div>

        {/* Local Whisper URL */}
        {useLocalWhisper && (
          <div className="mb-6 pl-8">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Local Whisper Service URL
            </label>
            <input
              type="text"
              value={localWhisperUrl}
              onChange={(e) => setLocalWhisperUrl(e.target.value)}
              placeholder="http://localhost:8000"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              URL of your local Whisper service. Default: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">http://localhost:8000</code>
            </p>
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs text-blue-800 dark:text-blue-300">
                <strong>ℹ️ How it works:</strong> When Lambda is running locally (<code>make dev</code>), 
                the system will first attempt transcription via your local Whisper service. 
                If the local service is unavailable or fails, it automatically falls back to your configured 
                cloud STT providers (OpenAI, Groq, etc.) for reliability.
              </p>
            </div>
          </div>
        )}

        {/* Info about cloud providers */}
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <strong>Cloud STT Providers:</strong> Configure your speech-to-text providers in 
            the <strong>Provider</strong> tab (OpenAI Whisper, Groq Whisper, etc.). These will be 
            used when local Whisper is disabled or unavailable.
          </p>
        </div>
      </section>

      {/* Usage Tips */}
      <section className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg p-6 border border-indigo-200 dark:border-indigo-800">
        <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 mb-3">
          💡 Usage Tips
        </h4>
        <ul className="space-y-2 text-sm text-indigo-800 dark:text-indigo-300">
          <li className="flex gap-2">
            <span className="text-indigo-600 dark:text-indigo-400">•</span>
            <span>Enable continuous voice mode from the chat interface microphone button</span>
          </li>
          <li className="flex gap-2">
            <span className="text-indigo-600 dark:text-indigo-400">•</span>
            <span>Speak clearly and at a moderate pace for best recognition accuracy</span>
          </li>
          <li className="flex gap-2">
            <span className="text-indigo-600 dark:text-indigo-400">•</span>
            <span>Wait for the AI to finish responding before saying the hotword again</span>
          </li>
          <li className="flex gap-2">
            <span className="text-indigo-600 dark:text-indigo-400">•</span>
            <span>Lower sensitivity if you experience frequent false activations</span>
          </li>
          <li className="flex gap-2">
            <span className="text-indigo-600 dark:text-indigo-400">•</span>
            <span>Increase timeout if you need more time to formulate your questions</span>
          </li>
        </ul>
      </section>
    </div>
  );
};
