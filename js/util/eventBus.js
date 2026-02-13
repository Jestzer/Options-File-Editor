export class EventBus {
    constructor() {
        this._handlers = {};
    }

    on(event, fn) {
        (this._handlers[event] ??= []).push(fn);
        return () => this.off(event, fn);
    }

    off(event, fn) {
        this._handlers[event] = (this._handlers[event] || []).filter(h => h !== fn);
    }

    emit(event, data) {
        (this._handlers[event] || []).forEach(fn => fn(data));
    }
}
