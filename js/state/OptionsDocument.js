import { uid } from "../util/uid.js";

export class OptionsDocument {
    constructor() {
        this._directives = [];
        this._listeners = [];
    }

    get directives() {
        return [...this._directives];
    }

    get length() {
        return this._directives.length;
    }

    getById(id) {
        return this._directives.find(d => d.uid === id) ?? null;
    }

    getByType(type) {
        return this._directives.filter(d => d.type === type);
    }

    getGroups() {
        return this._directives.filter(d => d.type === "GROUP");
    }

    getHostGroups() {
        return this._directives.filter(d => d.type === "HOST_GROUP");
    }

    getGroupNames() {
        return this.getGroups().map(g => g.groupName);
    }

    getHostGroupNames() {
        return this.getHostGroups().map(g => g.groupName);
    }

    hasGroupCaseInsensitive() {
        return this._directives.some(d => d.type === "GROUPCASEINSENSITIVE");
    }

    // --- Mutators ---

    add(directive, atIndex = -1) {
        if (!directive.uid) {
            directive.uid = uid();
        }
        if (atIndex >= 0 && atIndex < this._directives.length) {
            this._directives.splice(atIndex, 0, directive);
        } else {
            this._directives.push(directive);
        }
        this._notify("add", directive);
        return directive;
    }

    update(id, changes) {
        const idx = this._directives.findIndex(d => d.uid === id);
        if (idx === -1) return null;
        const directive = { ...this._directives[idx], ...changes, uid: id };
        this._directives[idx] = directive;
        this._notify("update", directive);
        return directive;
    }

    remove(id) {
        const idx = this._directives.findIndex(d => d.uid === id);
        if (idx === -1) return null;
        const [removed] = this._directives.splice(idx, 1);
        this._notify("remove", removed);
        return removed;
    }

    move(id, newIndex) {
        const oldIdx = this._directives.findIndex(d => d.uid === id);
        if (oldIdx === -1) return;
        const [item] = this._directives.splice(oldIdx, 1);
        const clampedIndex = Math.max(0, Math.min(newIndex, this._directives.length));
        this._directives.splice(clampedIndex, 0, item);
        this._notify("move", item);
    }

    clear() {
        this._directives = [];
        this._notify("clear", null);
    }

    /**
     * Replace all directives at once (used when loading a file).
     */
    replaceAll(directives) {
        this._directives = directives.map(d => {
            if (!d.uid) d.uid = uid();
            return d;
        });
        this._notify("replaceAll", null);
    }

    // --- Observable ---

    onChange(listener) {
        this._listeners.push(listener);
        return () => {
            this._listeners = this._listeners.filter(l => l !== listener);
        };
    }

    _notify(changeType, directive) {
        for (const listener of this._listeners) {
            listener(changeType, directive);
        }
    }
}
