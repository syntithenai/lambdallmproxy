declare module 'speak-tts' {
  interface SpeakConfig {
    text: string;
    queue?: boolean;
    listeners?: {
      onstart?: () => void;
      onend?: () => void;
      onerror?: (err: Error) => void;
    };
  }

  interface InitConfig {
    volume?: number;
    lang?: string;
    rate?: number;
    pitch?: number;
    splitSentences?: boolean;
  }

  interface Voice {
    name: string;
    lang: string;
    voiceURI?: string;
  }

  class Speech {
    constructor();
    init(config?: InitConfig): Promise<void>;
    speak(config: SpeakConfig): Promise<void>;
    voices(): Voice[];
    cancel(): void;
    pause(): void;
    resume(): void;
  }

  export default Speech;
}
