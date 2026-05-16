declare const __SERVER_URL__: string;

export const SERVER_URL = __SERVER_URL__;
export const API_URL = SERVER_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
