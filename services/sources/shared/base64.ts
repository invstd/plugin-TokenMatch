/**
 * Decode base64 content (e.g. from GitHub/GitLab API responses).
 * Handles Figma plugin environments where atob may not be available.
 */
export function decodeBase64Content(encodedContent: string): string {
  try {
    // Remove whitespace (APIs often return base64 with newlines)
    const clean = encodedContent.replace(/\s/g, '');

    // Decode base64 to binary string
    let binaryString: string;
    if (typeof atob === 'function') {
      binaryString = atob(clean);
    } else {
      // Fallback manual decode for environments without atob
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      binaryString = '';
      let i = 0;
      const cleanNoPad = clean.replace(/=+$/, '');
      while (i < cleanNoPad.length) {
        const enc1 = chars.indexOf(cleanNoPad.charAt(i++));
        const enc2 = chars.indexOf(cleanNoPad.charAt(i++));
        const enc3 = chars.indexOf(cleanNoPad.charAt(i++));
        const enc4 = chars.indexOf(cleanNoPad.charAt(i++));
        const bitmap = (enc1 << 18) | (enc2 << 12) | ((enc3 & 63) << 6) | (enc4 & 63);
        binaryString += String.fromCharCode((bitmap >> 16) & 255);
        if (enc3 !== -1) binaryString += String.fromCharCode((bitmap >> 8) & 255);
        if (enc4 !== -1) binaryString += String.fromCharCode(bitmap & 255);
      }
    }

    // Convert binary string to UTF-8
    let result: string;
    if (typeof TextDecoder !== 'undefined') {
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      result = new TextDecoder('utf-8').decode(bytes);
    } else {
      // Fallback: decodeURIComponent + escape trick for UTF-8
      try {
        result = decodeURIComponent(escape(binaryString));
      } catch {
        result = binaryString;
      }
    }

    // Clean up common issues
    if (result.charCodeAt(0) === 0xFEFF) result = result.slice(1); // Remove BOM
    result = result.replace(/\0/g, ''); // Remove null bytes
    result = result.trim();

    return result;
  } catch (error) {
    throw new Error(`Failed to decode base64 content: ${error}`);
  }
}
