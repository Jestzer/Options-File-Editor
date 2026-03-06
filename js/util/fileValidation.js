/**
 * Check whether a File is likely a plain text file by scanning
 * the first 8 KB for null bytes.  Returns true if the file
 * appears to be text, false if it looks binary.
 */
export async function validateTextFile(file) {
    const slice = file.slice(0, 8192);
    const buffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(slice);
    });
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0) return false;
    }
    return true;
}
