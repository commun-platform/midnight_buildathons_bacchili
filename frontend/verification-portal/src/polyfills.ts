import { Buffer } from 'buffer';
import process from 'process';

globalThis.Buffer = Buffer;
(globalThis as typeof globalThis & { process: typeof process }).process = process;
