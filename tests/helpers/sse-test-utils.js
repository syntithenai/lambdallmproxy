const createSSECollector = () => {
  const state = {
    buffer: '',
    events: [],
    rawChunks: [],
    metadata: null,
    ended: false
  };

  const parseBuffer = () => {
    let separatorIndex;
    while ((separatorIndex = state.buffer.indexOf('\n\n')) !== -1) {
      const segment = state.buffer.slice(0, separatorIndex);
      state.buffer = state.buffer.slice(separatorIndex + 2);

      let type = null;
      let dataPayload = '';

      segment.split('\n').forEach((line) => {
        if (line.startsWith('event: ')) {
          type = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          dataPayload += line.slice(6);
        }
      });

      if (type) {
        let parsed;
        try {
          parsed = dataPayload ? JSON.parse(dataPayload) : null;
        } catch (error) {
          parsed = dataPayload;
        }

        state.events.push({ type, data: parsed, raw: dataPayload });
      }
    }
  };

  const stream = {
    write: jest.fn((chunk) => {
      const text = chunk.toString();
      state.rawChunks.push(text);
      state.buffer += text;
      parseBuffer();
    }),
    end: jest.fn(() => {
      state.ended = true;
    })
  };

  return {
    stream,
    state,
    setMetadata(metadata) {
      state.metadata = metadata;
    },
    getEvents() {
      return state.events;
    },
    findEvent(type) {
      return state.events.find((evt) => evt.type === type);
    }
  };
};

module.exports = {
  createSSECollector
};
