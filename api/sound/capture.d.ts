/**
 * Development only: records what the sound puts out for a few seconds and hands it back as a WAV, so a build
 * with nobody listening can measure a mix: peaks against the limiter's ceiling, clipping, loudness.
 *
 * The output node is tapped by a `ScriptProcessorNode` that copies every block it hears, untouched, and writes
 * silence onward (it must reach the destination to run, and nothing is heard twice). The WAV is exactly what left
 * the core, after the limiter, at the context's sample rate; samples are clamped to -1..1 only where they become
 * 16-bit.
 */
/** A WAV file of 16-bit PCM from channels of floats (-1..1, clipped), interleaved. Pure. */
export declare function encodeWav(channels: readonly Float32Array[], rate: number): Blob;
/** A sound's two faces that capture reads. */
type Capturable = {
    context(): AudioContext | null;
    output(): AudioNode | null;
};
/**
 * Records `seconds` of a sound's output as a 16-bit stereo WAV. Rejects when the core is not running or the browser
 * has no `createScriptProcessor`; resolves with what was gathered if the context stops before the length is reached.
 */
export declare function capture(sound: Capturable, seconds: number): Promise<Blob>;
export {};
