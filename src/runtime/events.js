import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();

export function publish(type, payload) {
  emitter.emit('message', type, payload);
}

export function subscribe(listener) {
  emitter.on('message', listener);
  return () => emitter.off('message', listener);
}
