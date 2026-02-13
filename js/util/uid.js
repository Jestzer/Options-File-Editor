let counter = 0;

export function uid() {
    return `d_${++counter}`;
}

export function resetUidCounter() {
    counter = 0;
}
